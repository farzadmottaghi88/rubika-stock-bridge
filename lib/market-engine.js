const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));

function ratioScore(value, good = 1, strong = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n <= good) return 0;
  return clamp(((n - good) / (strong - good)) * 100);
}

function safeRatio(a, b) {
  const x = Number(a);
  const y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) && y > 0 ? x / y : null;
}

function enrichAnalysisFields(row) {
  const lastPrice = Number(row.lastPrice);
  const buyVol = Number(row.naturalBuyVolume);
  const sellVol = Number(row.naturalSellVolume);
  const buyCount = Number(row.naturalBuyCount);
  const sellCount = Number(row.naturalSellCount);
  const legalBuy = Number(row.legalBuyVolume);
  const legalSell = Number(row.legalSellVolume);
  const bidVol = Number(row.bestBidVolume);
  const askVol = Number(row.bestAskVolume);

  const avgNaturalBuyVolume = buyCount > 0 ? buyVol / buyCount : null;
  const avgNaturalSellVolume = sellCount > 0 ? sellVol / sellCount : null;

  const liquidityScore = clamp(
    ((Number(row.tradeCount) || 0) / 3000) * 70 +
    ((Number(row.tradeValue) || 0) / 1e12) * 30
  );

  return {
    ...row,
    liquidityScore,
    avgNaturalBuyVolume,
    avgNaturalSellVolume,
    avgNaturalBuyValue: Number.isFinite(avgNaturalBuyVolume) && Number.isFinite(lastPrice)
      ? avgNaturalBuyVolume * lastPrice
      : null,
    avgNaturalSellValue: Number.isFinite(avgNaturalSellVolume) && Number.isFinite(lastPrice)
      ? avgNaturalSellVolume * lastPrice
      : null,
    legalNetVolume: Number.isFinite(legalBuy) && Number.isFinite(legalSell)
      ? legalBuy - legalSell
      : null,
    legalBehavior:
      Number.isFinite(legalBuy) && Number.isFinite(legalSell)
        ? legalBuy > legalSell
          ? "حقوقی خریدار"
          : legalSell > legalBuy
            ? "حقوقی فروشنده"
            : "حقوقی متعادل"
        : "نامشخص",
    orderBookDemandRatio: safeRatio(bidVol, askVol),
    orderBookDepth: Number.isFinite(bidVol) && Number.isFinite(askVol)
      ? bidVol + askVol
      : null,
    trendState:
      Number(row.sma20) > Number(row.sma50) &&
      Number(row.lastPrice) >= Number(row.closePrice)
        ? "مثبت"
        : Number(row.sma20) > Number(row.sma50)
          ? "صعودی"
          : "خنثی/منفی",
    valuationState: Number.isFinite(Number(row.peGapPercent))
      ? Number(row.peGapPercent) >= 0
        ? "زیر ارزش نظری گروه"
        : "بالاتر از ارزش نظری گروه"
      : "داده ارزش‌گذاری موجود نیست"
  };
}

function scoreSymbol(row) {
  const flow = ratioScore(row.realMoneyFlowRatio, 1, 3);
  const buyerPower = ratioScore(row.buyerPower, 1, 2.5);
  const volume = ratioScore(row.volumeRatio30d, 1, 3);
  const trend =
    (Number(row.lastPrice) > Number(row.closePrice) ? 35 : 0) +
    (Number(row.sma20) > Number(row.sma50) ? 35 : 0) +
    (row.resistanceBreak ? 30 : 0);
  const liquidity = clamp(
    ((Number(row.tradeCount) || 0) / 3000) * 70 +
    ((Number(row.tradeValue) || 0) / 1e12) * 30
  );
  const valuation =
    Number.isFinite(Number(row.peGapPercent))
      ? clamp(Number(row.peGapPercent) + 50)
      : 0;

  const score =
    flow * 0.30 +
    ((buyerPower + volume) / 2) * 0.25 +
    trend * 0.20 +
    liquidity * 0.10 +
    valuation * 0.15;

  return Math.round(clamp(score) * 10) / 10;
}

export function analyzeMarket(rows = []) {
  const clean = rows
    .filter(row => row && row.symbol)
    .map(row => enrichAnalysisFields({ ...row, score: scoreSymbol(row) }))
    .filter(row =>
      Number(row.realMoneyFlowRatio) >= 1 &&
      Number(row.buyerPower) > 1 &&
      Number(row.volumeRatio30d) >= 1 &&
      Number(row.tradeCount) > 30
    )
    .sort((a, b) => b.score - a.score);

  return {
    scanned: rows.length,
    selected: clean.slice(0, 10),
    watchlist: clean.slice(10, 15)
  };
}

export function marketSummary(rows = []) {
  const result = analyzeMarket(rows);
  return result.selected.map((row, index) =>
    `${index + 1}. ${row.symbol} — امتیاز ${row.score} | ورود پول ${Number(row.realMoneyFlowRatio).toFixed(1)}x | قدرت خریدار ${Number(row.buyerPower).toFixed(1)}x | حجم ${Number(row.volumeRatio30d).toFixed(1)}x`
  ).join("\n");
}
