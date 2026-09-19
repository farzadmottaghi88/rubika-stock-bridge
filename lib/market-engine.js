const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));

function ratioScore(value, good = 1, strong = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n <= good) return 0;
  return clamp(((n - good) / (strong - good)) * 100);
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
    .map(row => ({ ...row, score: scoreSymbol(row) }))
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
