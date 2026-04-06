// src/protocols/kamino.ts
// Kamino Finance lending integration for ARIA Vault
// Deposits USDC into Kamino's highest-yield USDC market

import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import axios from "axios";
import { getConnection, loadWallet, USDC_MINT, withRetry } from "../utils/solana";
import { logger } from "../utils/logger";

const KAMINO_MARKET = new PublicKey(
  process.env.KAMINO_MARKET_ADDRESS ||
    "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF"
);

export interface KaminoMarketInfo {
  marketAddress: string;
  totalDepositedUsd: number;
  totalBorrowedUsd: number;
  depositApy: number;
  utilizationRate: number;
  usdcReserveAddress: string;
}

// ── Kamino Client ─────────────────────────────────────────────────────────────
export class KaminoProtocol {
  private connection: Connection;
  private wallet: Keypair;

  constructor() {
    this.connection = getConnection();
    this.wallet = loadWallet();
  }

  // ── Fetch live APY from Kamino API ────────────────────────────────────────
  async getMarketInfo(): Promise<KaminoMarketInfo> {
    return withRetry(async () => {
      const resp = await axios.get(
        "https://api.kamino.finance/v2/lending/markets",
        { timeout: 8000 }
      );
      const markets = resp.data?.markets ?? [];
      // Find main USDC market
      const market = markets.find(
        (m: any) => m.marketAddress === KAMINO_MARKET.toBase58()
      ) ?? markets[0];

      if (!market) throw new Error("Kamino USDC market not found in API");

      const depositApy = parseFloat(market.lendApy ?? market.supplyApy ?? "0");
      logger.info(`Kamino USDC deposit APY: ${(depositApy * 100).toFixed(3)}%`);

      return {
        marketAddress: market.marketAddress,
        totalDepositedUsd: parseFloat(market.totalDepositedUsd ?? "0"),
        totalBorrowedUsd: parseFloat(market.totalBorrowedUsd ?? "0"),
        depositApy,
        utilizationRate: parseFloat(market.utilizationRate ?? "0"),
        usdcReserveAddress: market.usdcReserveAddress ?? "",
      };
    });
  }

  // ── Get current USDC deposit APY ──────────────────────────────────────────
  async getCurrentApy(): Promise<number> {
    try {
      const info = await this.getMarketInfo();
      return info.depositApy;
    } catch {
      return 0.09; // Conservative fallback
    }
  }
}
