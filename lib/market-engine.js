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
  const orderbook = Number.isFinite(Number(row.orderBookDemandRatio))
    ? ratioScore(row.orderBookDemandRatio, 1, 2.5)
    : 0;
  const valuation = Number.isFinite(Number(row.peGapPercent))
    ? clamp((Number(row.peGapPercent) + 25) * 2)
    : 0;

  const score =
    flow * 0.25 +
    buyerPower * 0.20 +
    volume * 0.15 +
    trend * 0.15 +
    liquidity * 0.10 +
    orderbook * 0.05 +
    valuation * 0.10;

  return Math.round(clamp(score) * 10) / 10;
}


function buildTradePlan(row) {
  const entry = Number(row.lastPrice);
  const support = Number(row.support20d);
  const resistance = Number(row.resistance20d);
  const theoretical = Number(row.theoreticalPrice);

  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(support) || support <= 0) {
    return {
      entry: Number.isFinite(entry) ? entry : null,
      stop: null,
      target: null,
      riskPercent: null,
      rewardPercent: null,
      riskReward: null,
      signalEligible: false,
      signalReason: "حمایت معتبر در تاریخچه موجود نیست"
    };
  }

  const stop = support * 0.99;
  const targets = [resistance, theoretical]
    .filter(x => Number.isFinite(x) && x > entry)
    .sort((a, b) => a - b);
  const target = targets.length ? targets[0] : null;
  const riskPercent = ((entry - stop) / entry) * 100;
  const rewardPercent = target ? ((target - entry) / entry) * 100 : null;
  const riskReward = target && riskPercent > 0 ? rewardPercent / riskPercent : null;

  const strictVolume = Number(row.volumeRatio30d) >= 3;
  const positiveTrend = Number(row.sma20) > Number(row.sma50);
  const liquid = Number(row.liquidityScore) >= 30;
  const signalEligible =
    strictVolume &&
    positiveTrend &&
    liquid &&
    Number(row.realMoneyFlowRatio) >= 1 &&
    Number(row.buyerPower) > 1 &&
    Number.isFinite(riskReward) &&
    riskReward >= 2;

  return {
    entry,
    stop,
    target,
    riskPercent,
    rewardPercent,
    riskReward,
    signalEligible,
    signalReason: signalEligible
      ? "حجم، روند، نقدشوندگی و R/R مطابق فیلتر سیگنال"
      : "فیلتر سیگنال کامل نشده"
  };
}


export function analyzeMarket(rows = []) {
  const clean = rows
    .filter(row => row && row.symbol)
    .map(row => {
      const enriched = enrichAnalysisFields({ ...row, score: scoreSymbol(row) });
      return { ...enriched, tradePlan: buildTradePlan(enriched) };
    })
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


export function analyzeSignals(rows = []) {
  const result = analyzeMarket(rows);
  const pool = [...result.selected, ...result.watchlist]
    .filter(row => row.tradePlan?.signalEligible)
    .sort((a, b) => {
      const rr = Number(b.tradePlan?.riskReward || 0) - Number(a.tradePlan?.riskReward || 0);
      return rr !== 0 ? rr : Number(b.score || 0) - Number(a.score || 0);
    });
  return {
    scanned: rows.length,
    selected: pool.slice(0, 10)
  };
}
