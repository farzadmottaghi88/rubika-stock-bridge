import assert from "node:assert/strict";
import test from "node:test";
import { analyzeSignals } from "../lib/market-engine.js";

const base = {
  symbol: "TEST",
  lastPrice: 100,
  closePrice: 99,
  tradeCount: 500,
  tradeValue: 2e12,
  naturalBuyVolume: 120000,
  naturalSellVolume: 60000,
  naturalBuyCount: 100,
  naturalSellCount: 100,
  legalBuyVolume: 50000,
  legalSellVolume: 40000,
  bestBidVolume: 30000,
  bestAskVolume: 20000,
  realMoneyFlowRatio: 2,
  buyerPower: 2,
  volumeRatio30d: 4,
  sma20: 105,
  sma50: 95,
  support20d: 90,
  resistance20d: 125,
  theoreticalPrice: 140,
  volatilityPct30d: 2
};

test("eligible signal has valid entry, stop, target and R/R", () => {
  const result = analyzeSignals([base]);
  assert.equal(result.selected.length, 1);
  const plan = result.selected[0].tradePlan;
  assert.equal(plan.entry, 100);
  assert.ok(plan.stop < 90);
  assert.equal(plan.target, 125);
  assert.ok(plan.riskPercent > 0);
  assert.ok(plan.rewardPercent > 0);
  assert.ok(plan.riskReward >= 2);
  assert.equal(plan.signalEligible, true);
});

test("volume below 3x blocks signal", () => {
  const result = analyzeSignals([{ ...base, volumeRatio30d: 2.9 }]);
  assert.equal(result.selected.length, 0);
});

test("support at or above entry does not create a stop", () => {
  const result = analyzeSignals([{ ...base, support20d: 100 }]);
  assert.equal(result.selected.length, 0);
});

test("target below entry is rejected", () => {
  const result = analyzeSignals([{ ...base, resistance20d: 95, theoreticalPrice: 99 }]);
  assert.equal(result.selected.length, 0);
});

test("missing support never fabricates stop or target", () => {
  const result = analyzeSignals([{ ...base, support20d: null }]);
  assert.equal(result.selected.length, 0);
});
