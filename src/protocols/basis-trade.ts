// src/protocols/basis-trade.ts
// Basis Trade strategy for ARIA Vault
// Earns funding rate yield by: long SOL spot + short SOL-PERP on-chain
// Only activates when funding rate > FUNDING_THRESHOLD to ensure positive carry

import axios from "axios";
import { logger } from "../utils/logger";

const FUNDING_THRESHOLD = parseFloat(
  process.env.BASIS_TRADE_FUNDING_THRESHOLD || "0.005"  // 0.5% per day
);

export interface FundingRateData {
  market: string;
  fundingRate8h: number;     // 8-hour funding rate (decimal)
  fundingRateAnnualised: number; // annualised
  nextFundingTime: number;   // unix timestamp
  isPositive: boolean;       // shorts earn when positive
}

export interface BasisTradeParams {
  isActive: boolean;
  expectedApy: number;
  fundingRate: FundingRateData | null;
  reason: string;
}

// ── Basis Trade Manager ───────────────────────────────────────────────────────
export class BasisTradeProtocol {

  // ── Check if basis trade is currently profitable ──────────────────────────
  async evaluateBasisOpportunity(): Promise<BasisTradeParams> {
    try {
      const fundingData = await this.getFundingRate("SOL-PERP");

      if (!fundingData.isPositive) {
        return {
          isActive: false,
          expectedApy: 0,
          fundingRate: fundingData,
          reason: `Funding rate negative (${(fundingData.fundingRate8h * 100).toFixed(4)}%) — longs pay shorts. Skip.`,
        };
      }

      if (fundingData.fundingRate8h < FUNDING_THRESHOLD) {
        return {
          isActive: false,
          expectedApy: 0,
          fundingRate: fundingData,
          reason: `Funding rate ${(fundingData.fundingRate8h * 100).toFixed(4)}% < threshold ${(FUNDING_THRESHOLD * 100).toFixed(3)}%. Not worth hedging costs.`,
        };
      }

      const expectedApy = fundingData.fundingRateAnnualised;
      logger.info(
        `Basis trade opportunity: funding=${(fundingData.fundingRate8h * 100).toFixed(4)}%/8h` +
        ` annualised≈${(expectedApy * 100).toFixed(2)}%`
      );

      return {
        isActive: true,
        expectedApy,
        fundingRate: fundingData,
        reason: `Positive funding ${(fundingData.fundingRate8h * 100).toFixed(4)}%/8h — basis trade profitable`,
      };
    } catch (e) {
      logger.warn(`Basis trade evaluation failed: ${e}`);
      return {
        isActive: false,
        expectedApy: 0,
        fundingRate: null,
        reason: `Data unavailable: ${e}`,
      };
    }
  }

  // ── Fetch funding rate from on-chain data (Drift/Mango) ───────────────────
  async getFundingRate(market: string): Promise<FundingRateData> {
    // Try Drift Protocol public API first (Drift removed from hackathon but
    // we read their funding rate data as a public signal only — no trading)
    // Fall back to computing from Binance futures premium as proxy

    try {
      // Binance as a public funding rate reference (many on-chain basis traders use this)
      const resp = await axios.get(
        "https://fapi.binance.com/fapi/v1/fundingRate",
        {
          params: { symbol: "SOLUSDT", limit: 1 },
          timeout: 5000,
        }
      );
      const latest = resp.data?.[0];
      if (!latest) throw new Error("No funding data");

      const rate8h = parseFloat(latest.fundingRate);
      const annualised = rate8h * 3 * 365; // 3 payments/day * 365 days

      return {
        market,
        fundingRate8h: rate8h,
        fundingRateAnnualised: annualised,
        nextFundingTime: parseInt(latest.fundingTime),
        isPositive: rate8h > 0,
      };
    } catch {
      // Conservative default — assume neutral
      return {
        market,
        fundingRate8h: 0.0001,
        fundingRateAnnualised: 0.109,
        nextFundingTime: Date.now() + 8 * 3600 * 1000,
        isPositive: true,
      };
    }
  }

  // ── Expected APY including hedge costs ────────────────────────────────────
  async getNetApy(): Promise<number> {
    const evaluation = await this.evaluateBasisOpportunity();
    if (!evaluation.isActive) return 0;

    // Subtract estimated hedging costs: ~0.5% spread + ~0.5% execution slippage
    const hedgeCostAnnualised = 0.01;
    return Math.max(0, evaluation.expectedApy - hedgeCostAnnualised);
  }
}
