// scripts/backtest.ts
// ARIA Vault Backtesting Script
// Simulates ARIA strategy vs simple single-protocol benchmark
// Uses 90-day historical APY data to validate strategy

import { ARIAAllocator, PROTOCOLS } from "../src/vault/allocator";
import { logger } from "../src/utils/logger";
import fs from "fs";

interface DayData {
  date: string;
  protocolApys: Record<number, number>;
  riskScores: Record<number, number>;
}

// ── Synthetic 90-day historical data ─────────────────────────────────────────
// Replace with real historical data from Helius/DeFiLlama for submission
function generateBacktestData(days = 90): DayData[] {
  const data: DayData[] = [];
  const baseApys = {
    1: 0.10, // Kamino
    2: 0.09, // MarginFi
    3: 0.08, // Save
    4: 0.14, // Basis Trade
  };

  for (let d = 0; d < days; d++) {
    const date = new Date(Date.now() - (days - d) * 86400000)
      .toISOString()
      .split("T")[0];

    const protocolApys: Record<number, number> = {};
    const riskScores: Record<number, number> = {};

    for (const [pid, base] of Object.entries(baseApys)) {
      const id = parseInt(pid);
      // Add realistic variation: ±30% around base with occasional spikes
      const noise = (Math.random() - 0.5) * 0.04;
      const spike = Math.random() < 0.05 ? (Math.random() * 0.06) : 0;
      protocolApys[id] = Math.max(0.03, base + noise + spike);

      // Risk scores vary — occasional risk events
      const riskEvent = Math.random() < 0.08 ? Math.random() * 40 : 0;
      riskScores[id] = Math.min(100, 25 + Math.random() * 20 + riskEvent);
    }

    data.push({ date, protocolApys, riskScores });
  }
  return data;
}

// ── Run backtest ─────────────────────────────────────────────────────────────
async function runBacktest() {
  logger.info("═══════════════════════════════════════");
  logger.info("    ARIA Vault — 90-Day Backtest");
  logger.info("═══════════════════════════════════════");

  const days = generateBacktestData(90);

  let ariaNav = 10000;   // ARIA strategy, $10k initial
  let benchNav = 10000;  // Benchmark: 100% Kamino only

  const dailyReturns: number[] = [];
  let rebalanceCount = 0;
  let riskExclusions = 0;

  for (const day of days) {
    // ── ARIA strategy ────────────────────────────────────────────────────
    // Simulate allocation router with that day's data
    let ariaApy = 0;
    const eligibleProtocols = Object.entries(day.riskScores)
      .filter(([, score]) => score < 75)
      .map(([pid]) => parseInt(pid));

    if (eligibleProtocols.length > 0) {
      // Equal weight across eligible protocols (simplified for backtest)
      const weight = 1 / eligibleProtocols.length;
      ariaApy = eligibleProtocols.reduce(
        (sum, pid) => sum + day.protocolApys[pid] * weight, 0
      );

      const excluded = Object.keys(day.riskScores).length - eligibleProtocols.length;
      if (excluded > 0) riskExclusions++;
    } else {
      ariaApy = 0; // All protocols too risky — hold USDC
    }

    // ── Benchmark: 100% Kamino ───────────────────────────────────────────
    const benchApy = day.protocolApys[1];

    // Apply daily compounding
    const ariaDaily = ariaApy / 365;
    const benchDaily = benchApy / 365;

    ariaNav *= (1 + ariaDaily);
    benchNav *= (1 + benchDaily);
    dailyReturns.push(ariaDaily);
    rebalanceCount++;
  }

  // ── Compute metrics ──────────────────────────────────────────────────────
  const ariaReturn = (ariaNav - 10000) / 10000;
  const benchReturn = (benchNav - 10000) / 10000;
  const ariaAnnualisedApy = Math.pow(ariaNav / 10000, 365 / 90) - 1;
  const benchAnnualisedApy = Math.pow(benchNav / 10000, 365 / 90) - 1;

  // Sharpe ratio (simplified, risk-free = 5% annually)
  const meanDaily = dailyReturns.reduce((a, b) => a + b) / dailyReturns.length;
  const variance = dailyReturns.reduce((s, r) => s + Math.pow(r - meanDaily, 2), 0) / dailyReturns.length;
  const dailyStd = Math.sqrt(variance);
  const sharpe = dailyStd > 0
    ? ((meanDaily - 0.05 / 365) / dailyStd) * Math.sqrt(365)
    : 0;

  // Max drawdown
  let peak = 10000;
  let maxDrawdown = 0;
  let nav = 10000;
  for (const r of dailyReturns) {
    nav *= (1 + r);
    if (nav > peak) peak = nav;
    const dd = (peak - nav) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  logger.info("\n📊 BACKTEST RESULTS");
  logger.info("─────────────────────────────────────");
  logger.info(`ARIA Strategy:`);
  logger.info(`  90-day return:    ${(ariaReturn * 100).toFixed(2)}%`);
  logger.info(`  Annualised APY:   ${(ariaAnnualisedApy * 100).toFixed(2)}%`);
  logger.info(`  Final NAV:        $${ariaNav.toFixed(2)}`);
  logger.info(`  Sharpe ratio:     ${sharpe.toFixed(2)}`);
  logger.info(`  Max drawdown:     ${(maxDrawdown * 100).toFixed(2)}%`);
  logger.info(`  Risk exclusions:  ${riskExclusions} days`);
  logger.info(`Benchmark (Kamino only):`);
  logger.info(`  90-day return:    ${(benchReturn * 100).toFixed(2)}%`);
  logger.info(`  Annualised APY:   ${(benchAnnualisedApy * 100).toFixed(2)}%`);
  logger.info(`  Final NAV:        $${benchNav.toFixed(2)}`);
  logger.info(`Alpha:              ${((ariaAnnualisedApy - benchAnnualisedApy) * 100).toFixed(2)}%`);
  logger.info("─────────────────────────────────────");

  // Save results
  const results = {
    runDate: new Date().toISOString(),
    aria: { return: ariaReturn, annualisedApy: ariaAnnualisedApy, sharpe, maxDrawdown, finalNav: ariaNav },
    benchmark: { return: benchReturn, annualisedApy: benchAnnualisedApy, finalNav: benchNav },
    alpha: ariaAnnualisedApy - benchAnnualisedApy,
    days: 90,
  };

  if (!fs.existsSync("logs")) fs.mkdirSync("logs");
  fs.writeFileSync("logs/backtest-results.json", JSON.stringify(results, null, 2));
  logger.info("Results saved to logs/backtest-results.json");
}

runBacktest().catch(console.error);
