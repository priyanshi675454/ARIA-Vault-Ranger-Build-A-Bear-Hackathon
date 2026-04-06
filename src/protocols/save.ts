// src/protocols/save.ts
// Save (formerly Solend) lending integration for ARIA Vault

import axios from "axios";
import { withRetry } from "../utils/solana";
import { logger } from "../utils/logger";

export interface SaveReserveInfo {
  reserveAddress: string;
  depositApy: number;
  utilizationRate: number;
  totalDepositedUsd: number;
  availableLiquidityUsd: number;
}

export class SaveProtocol {
  async getUsdcReserveInfo(): Promise<SaveReserveInfo> {
    return withRetry(async () => {
      const resp = await axios.get(
        "https://api.solend.fi/v1/reserves?scope=solend",
        { timeout: 8000 }
      );
      const results: any[] = resp.data?.results ?? [];
      // Find USDC reserve by mint
      const usdc = results.find(
        (r) =>
          r.reserve?.liquidity?.mintPubkey ===
          "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
      );

      if (!usdc) throw new Error("Save USDC reserve not found");

      const supplyApy = parseFloat(usdc.rates?.supplyInterest ?? "0.08");
      const available = parseFloat(
        usdc.reserve?.liquidity?.availableAmountWads ?? "1"
      );
      const borrowed = parseFloat(
        usdc.reserve?.liquidity?.borrowedAmountWads ?? "0"
      );
      const utilizationRate = borrowed / (available + borrowed) || 0;

      logger.info(`Save USDC supply APY: ${(supplyApy * 100).toFixed(3)}%`);

      return {
        reserveAddress: usdc.reserve?.pubkey ?? "",
        depositApy: supplyApy,
        utilizationRate,
        totalDepositedUsd: available + borrowed,
        availableLiquidityUsd: available,
      };
    });
  }

  async getCurrentApy(): Promise<number> {
    try {
      const info = await this.getUsdcReserveInfo();
      return info.depositApy;
    } catch {
      return 0.075;
    }
  }
}
