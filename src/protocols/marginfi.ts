// src/protocols/marginfi.ts
// MarginFi lending integration for ARIA Vault
// Deposits USDC into MarginFi for supply yield

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import axios from "axios";
import { getConnection, loadWallet, withRetry } from "../utils/solana";
import { logger } from "../utils/logger";

const MARGINFI_GROUP = new PublicKey(
  process.env.MARGINFI_GROUP_ADDRESS ||
    "4qp6Fx6tnZkY5Wropq9wUYgtFxXKwE6viZxFHg3rdAG8"
);

const USDC_MINT_STR = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export interface MarginFiBankInfo {
  bankAddress: string;
  mint: string;
  depositApy: number;
  borrowApy: number;
  utilizationRate: number;
  totalDepositsUsd: number;
  assetWeightInit: number;
}

export class MarginFiProtocol {
  private connection: Connection;
  private wallet: Keypair;

  constructor() {
    this.connection = getConnection();
    this.wallet = loadWallet();
  }

  async getUsdcBankInfo(): Promise<MarginFiBankInfo> {
    return withRetry(async () => {
      const resp = await axios.get(
        "https://production.marginfi.com/v1/banks",
        { timeout: 8000 }
      );
      const banks: any[] = resp.data?.banks ?? [];
      const usdc = banks.find((b) => b.mint === USDC_MINT_STR);

      if (!usdc) throw new Error("MarginFi USDC bank not found");

      const depositApy = parseFloat(usdc.depositApy ?? usdc.lendingRate ?? "0");
      logger.info(`MarginFi USDC deposit APY: ${(depositApy * 100).toFixed(3)}%`);

      return {
        bankAddress: usdc.address ?? "",
        mint: usdc.mint,
        depositApy,
        borrowApy: parseFloat(usdc.borrowApy ?? "0"),
        utilizationRate: parseFloat(usdc.utilizationRate ?? "0.5"),
        totalDepositsUsd: parseFloat(usdc.totalDepositsUsd ?? "0"),
        assetWeightInit: parseFloat(usdc.config?.assetWeightInit ?? "1"),
      };
    });
  }

  async getCurrentApy(): Promise<number> {
    try {
      const info = await this.getUsdcBankInfo();
      return info.depositApy;
    } catch {
      return 0.085; // conservative fallback
    }
  }
}
