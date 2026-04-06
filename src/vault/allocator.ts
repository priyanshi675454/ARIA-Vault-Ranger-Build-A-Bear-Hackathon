// src/vault/allocator.ts
// ARIA Allocation Router — the brain of the vault
// Weights USDC across protocols using risk scores from the oracle + AI signals

import axios from "axios";
import { ProtocolAllocation } from "./ranger-client";
import { RiskOracleClient } from "../oracle/risk-oracle";
import { logger } from "../utils/logger";
import dotenv from "dotenv";

dotenv.config();

const MAX_SINGLE_PROTOCOL = parseFloat(
  process.env.MAX_SINGLE_PROTOCOL_ALLOCATION || "0.50"
);
const MAX_RISK_THRESHOLD = parseInt(process.env.MAX_RISK_THRESHOLD || "75");
const AI_ENGINE_URL = process.env.AI_ENGINE_URL || "http://localhost:8000";

// ── Protocol registry ─────────────────────────────────────────────────────────
export const PROTOCOLS = {
  KAMINO:  { id: 1, name: "Kamino Lending",  baseApy: 0.10 },
  MARGINFI:{ id: 2, name: "MarginFi Lending", baseApy: 0.09 },
  SAVE:    { id: 3, name: "Save (Solend)",    baseApy: 0.08 },
  BASIS:   { id: 4, name: "Basis Trade",      baseApy: 0.15 },
};

export interface AISignal {
  protocolId: number;
  predictedApy: number;
  confidence: number;     // 0–1
  recommendedWeight: number; // 0–1
}

// ── ARIA Allocator ────────────────────────────────────────────────────────────
export class ARIAAllocator {
  private oracle: RiskOracleClient;

  constructor() {
    this.oracle = new RiskOracleClient();
  }

  // ── Main entry: compute optimal allocations ──────────────────────────────
  async computeAllocations(): Promise<ProtocolAllocation[]> {
    logger.info("Computing new ARIA allocations...");

    // 1. Fetch live risk scores from on-chain oracle
    const riskScores = await this.oracle.getAllRiskScores();
    logger.info(`Risk scores: ${JSON.stringify(riskScores)}`);

    // 2. Fetch AI rebalancing signals
    const aiSignals = await this.fetchAISignals();
    logger.info(`AI signals received: ${aiSignals.length} protocols`);

    // 3. Compute raw weights
    const rawAllocations = Object.values(PROTOCOLS).map((protocol) => {
      const risk = riskScores[protocol.id] ?? 50;
      const ai = aiSignals.find((s) => s.protocolId === protocol.id);

      // Skip protocol if risk is too high
      if (risk >= MAX_RISK_THRESHOLD) {
        logger.warn(`Protocol ${protocol.name} risk score ${risk} — excluding`);
        return null;
      }

      // Weight formula: higher AI confidence + lower risk = higher weight
      const riskFactor = (100 - risk) / 100;          // 0–1, higher is safer
      const aiFactor = ai ? ai.confidence : 0.5;
      const apyFactor = (ai?.predictedApy ?? protocol.baseApy);

      const rawWeight = riskFactor * aiFactor * apyFactor;

      return {
        protocolId: protocol.id,
        protocolName: protocol.name,
        rawWeight,
        currentApy: apyFactor,
        riskScore: risk,
        minApyBps: Math.floor((process.env.MIN_APY_THRESHOLD
          ? parseFloat(process.env.MIN_APY_THRESHOLD)
          : 0.10) * 10000),
      };
    }).filter((x): x is Exclude<typeof x, null> => x !== null);

    // 4. Normalise weights to sum to 10000 bps
    const totalRaw = rawAllocations.reduce((s: number, a: any) => s + a.rawWeight, 0);

    let allocations: ProtocolAllocation[] = rawAllocations.map((a: any) => {
      let weight = totalRaw > 0 ? a.rawWeight / totalRaw : 0;
      // Cap single protocol at MAX_SINGLE_PROTOCOL
      weight = Math.min(weight, MAX_SINGLE_PROTOCOL);
      return {
        protocolId: a.protocolId,
        protocolName: a.protocolName,
        weightBps: Math.floor(weight * 10000),
        minApyBps: a.minApyBps,
        currentApy: a.currentApy,
        riskScore: a.riskScore,
      };
    });

    // 5. Re-normalise after capping
    allocations = this.renormalise(allocations);

    // 6. Log final allocations
    this.logAllocations(allocations);
    return allocations;
  }

  // ── Fetch AI signals from Python engine ─────────────────────────────────
  private async fetchAISignals(): Promise<AISignal[]> {
    try {
      const resp = await axios.get(`${AI_ENGINE_URL}/signals`, { timeout: 5000 });
      return resp.data.signals as AISignal[];
    } catch (e) {
      logger.warn(`AI engine unavailable, using equal weights: ${e}`);
      // Fallback: equal weight across all protocols
      return Object.values(PROTOCOLS).map((p) => ({
        protocolId: p.id,
        predictedApy: p.baseApy,
        confidence: 0.5,
        recommendedWeight: 0.25,
      }));
    }
  }

  // ── Re-normalise bps to exactly 10000 ───────────────────────────────────
  private renormalise(allocations: ProtocolAllocation[]): ProtocolAllocation[] {
    const total = allocations.reduce((s, a) => s + a.weightBps, 0);
    if (total === 0) return allocations;
    // Scale all weights so they sum to 10000
    const scale = 10000 / total;
    const scaled = allocations.map((a) => ({
      ...a,
      weightBps: Math.floor(a.weightBps * scale),
    }));
    // Assign remaining bps to highest-APY protocol
    const diff = 10000 - scaled.reduce((s, a) => s + a.weightBps, 0);
    const best = scaled.reduce((m, a) => (a.currentApy > m.currentApy ? a : m));
    best.weightBps += diff;
    return scaled;
  }

  // ── Compute blended expected APY ────────────────────────────────────────
  computeBlendedApy(allocations: ProtocolAllocation[]): number {
    return allocations.reduce(
      (sum, a) => sum + a.currentApy * (a.weightBps / 10000),
      0
    );
  }

  // ── Pretty print ────────────────────────────────────────────────────────
  private logAllocations(allocs: ProtocolAllocation[]): void {
    const blended = this.computeBlendedApy(allocs);
    logger.info("━━━━━━━━━━━━ ARIA ALLOCATION ━━━━━━━━━━━━");
    allocs.forEach((a) => {
      logger.info(
        `  ${a.protocolName.padEnd(20)} ${(a.weightBps / 100).toFixed(1).padStart(5)}%  ` +
        `APY: ${(a.currentApy * 100).toFixed(2)}%  Risk: ${a.riskScore}/100`
      );
    });
    logger.info(`  Blended APY: ${(blended * 100).toFixed(2)}%`);
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  }
}
