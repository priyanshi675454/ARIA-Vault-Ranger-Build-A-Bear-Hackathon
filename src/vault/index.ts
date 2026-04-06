// src/vault/index.ts
// ARIA Vault Controller — Main entry point
// Runs the rebalancing loop every REBALANCE_INTERVAL_MS

import { RangerClient } from "./ranger-client";
import { ARIAAllocator } from "./allocator";
import { RiskOracleClient } from "../oracle/risk-oracle";
import { logger } from "../utils/logger";
import { sleep } from "../utils/solana";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

// Ensure logs directory exists
if (!fs.existsSync("logs")) fs.mkdirSync("logs");

const REBALANCE_INTERVAL = parseInt(
  process.env.REBALANCE_INTERVAL_MS || "3600000"  // default 1 hour
);

// ── ARIA Controller ───────────────────────────────────────────────────────────
class ARIAController {
  private ranger: RangerClient;
  private allocator: ARIAAllocator;
  private oracle: RiskOracleClient;
  private isRunning = false;
  private cycleCount = 0;

  constructor() {
    this.ranger = new RangerClient();
    this.allocator = new ARIAAllocator();
    this.oracle = new RiskOracleClient();
  }

  async start(): Promise<void> {
    this.isRunning = true;
    logger.info("╔══════════════════════════════════════╗");
    logger.info("║     ARIA Vault Controller v1.0.0     ║");
    logger.info("║  Adaptive Risk-weighted Intelligence ║");
    logger.info("║        Allocator — Ranger Earn       ║");
    logger.info("╚══════════════════════════════════════╝");

    // Startup checks
    await this.healthCheck();

    // Main loop
    while (this.isRunning) {
      try {
        await this.runCycle();
      } catch (err) {
        logger.error(`Cycle ${this.cycleCount} failed: ${err}`);
        logger.info("Waiting 5 minutes before retry...");
        await sleep(5 * 60 * 1000);
      }
      logger.info(`Next rebalance in ${REBALANCE_INTERVAL / 60000} minutes`);
      await sleep(REBALANCE_INTERVAL);
    }
  }

  // ── Single rebalance cycle ────────────────────────────────────────────────
  private async runCycle(): Promise<void> {
    this.cycleCount++;
    logger.info(`\n── Cycle #${this.cycleCount} ──────────────────────────`);

    // 1. Fetch vault info
    const vaultInfo = await this.ranger.getVaultInfo();
    const vaultBalance = await this.ranger.getVaultUsdcBalance();
    logger.info(`Vault balance: ${vaultBalance.toFixed(2)} USDC`);

    // 2. Publish fresh risk scores on-chain
    await this.oracle.publishRiskScores();

    // 3. Compute optimal allocations (uses risk scores + AI signals)
    const allocations = await this.allocator.computeAllocations();

    if (allocations.length === 0) {
      logger.warn("No safe allocations found — holding USDC in vault (0% allocation)");
      return;
    }

    // 4. Guard: blended APY must exceed minimum
    const blendedApy = this.allocator.computeBlendedApy(allocations);
    const minApy = parseFloat(process.env.MIN_APY_THRESHOLD || "0.10");
    if (blendedApy < minApy) {
      logger.warn(
        `Blended APY ${(blendedApy * 100).toFixed(2)}% < minimum ${(minApy * 100).toFixed(2)}%. Skipping rebalance.`
      );
      return;
    }

    // 5. Execute rebalance on-chain via Ranger
    const txSig = await this.ranger.rebalance(allocations);
    logger.info(`Rebalance complete. TX: ${txSig}`);

    // 6. Save state snapshot
    this.saveSnapshot({
      timestamp: new Date().toISOString(),
      cycle: this.cycleCount,
      vaultBalance,
      blendedApy,
      allocations,
      txSignature: txSig,
    });
  }

  // ── Health check on startup ───────────────────────────────────────────────
  private async healthCheck(): Promise<void> {
    logger.info("Running startup health check...");

    if (!process.env.WALLET_PRIVATE_KEY) {
      throw new Error("WALLET_PRIVATE_KEY missing from .env");
    }
    if (!process.env.VAULT_ADDRESS || process.env.VAULT_ADDRESS === "your_ranger_vault_address_after_deployment") {
      logger.warn("VAULT_ADDRESS not set — running in simulation mode");
    }

    logger.info("Health check passed ✓");
  }

  // ── Persist snapshot to disk ──────────────────────────────────────────────
  private saveSnapshot(data: object): void {
    const filePath = "logs/snapshots.jsonl";
    fs.appendFileSync(filePath, JSON.stringify(data) + "\n");
  }

  stop(): void {
    this.isRunning = false;
    logger.info("ARIA Controller stopped.");
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────
const controller = new ARIAController();

process.on("SIGINT", () => {
  logger.info("Received SIGINT — shutting down gracefully");
  controller.stop();
  process.exit(0);
});

controller.start().catch((err) => {
  logger.error(`Fatal error: ${err}`);
  process.exit(1);
});
