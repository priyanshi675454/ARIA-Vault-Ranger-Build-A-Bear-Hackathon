// src/vault/ranger-client.ts
// Ranger Earn vault integration for ARIA strategy
// Docs: https://docs.ranger.finance

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { AnchorProvider, Program, BN, Idl } from "@coral-xyz/anchor";
import { getConnection, loadWallet, USDC_MINT, withRetry } from "../utils/solana";
import { logger } from "../utils/logger";
import dotenv from "dotenv";

dotenv.config();

// ── Constants ────────────────────────────────────────────────────────────────
export const RANGER_PROGRAM_ID = new PublicKey(
  process.env.RANGER_VAULT_PROGRAM_ID ||
    "RngrVRkrK7QFAzGBvkYDEnHECECgD5YrpxrLMtGZfGt"
);

export interface VaultInfo {
  address: string;
  totalAssets: number;   // USDC
  sharePrice: number;
  apy: number;
  manager: string;
  lockPeriodDays: number;
}

export interface DepositResult {
  txSignature: string;
  sharesReceived: number;
  usdcDeposited: number;
}

// ── Ranger Earn Client ───────────────────────────────────────────────────────
export class RangerClient {
  private connection: Connection;
  private wallet: Keypair;
  private vaultAddress: PublicKey;

  constructor() {
    this.connection = getConnection();
    this.wallet = loadWallet();
    this.vaultAddress = new PublicKey(
      process.env.VAULT_ADDRESS || PublicKey.default.toBase58()
    );
  }

  // ── Fetch vault state from on-chain ───────────────────────────────────────
  async getVaultInfo(): Promise<VaultInfo> {
    return withRetry(async () => {
      const accountInfo = await this.connection.getAccountInfo(this.vaultAddress);
      if (!accountInfo) throw new Error("Vault account not found on-chain");

      // Parse vault state (Ranger Earn uses Anchor IDL layout)
      // Real parsing depends on Ranger's IDL — this follows their documented structure
      const data = accountInfo.data;
      const totalAssets = new BN(data.slice(8, 16), "le").toNumber() / 1e6;
      const sharePrice = new BN(data.slice(16, 24), "le").toNumber() / 1e9;

      logger.info(`Vault state: totalAssets=${totalAssets} USDC, sharePrice=${sharePrice}`);

      return {
        address: this.vaultAddress.toBase58(),
        totalAssets,
        sharePrice,
        apy: 0, // computed separately by AI engine
        manager: this.wallet.publicKey.toBase58(),
        lockPeriodDays: 90,
      };
    });
  }

  // ── Get vault USDC balance ─────────────────────────────────────────────────
  async getVaultUsdcBalance(): Promise<number> {
    const vaultUsdcAta = await getAssociatedTokenAddress(
      USDC_MINT,
      this.vaultAddress,
      true // allowOwnerOffCurve — PDAs are off-curve
    );
    const info = await this.connection.getTokenAccountBalance(vaultUsdcAta);
    return parseFloat(info.value.uiAmountString ?? "0");
  }

  // ── Rebalance: instruct vault to reallocate ────────────────────────────────
  // Called by the ARIA allocation router when weights change
  async rebalance(allocations: ProtocolAllocation[]): Promise<string> {
    logger.info("Initiating rebalance transaction...");
    logger.info(`New allocations: ${JSON.stringify(allocations, null, 2)}`);

    // Build allocation instruction data
    const allocationData = this.encodeAllocations(allocations);

    const ix = new TransactionInstruction({
      programId: RANGER_PROGRAM_ID,
      keys: [
        { pubkey: this.vaultAddress, isSigner: false, isWritable: true },
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: USDC_MINT, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        Buffer.from([0x52, 0x65, 0x62, 0x61, 0x6c, 0x61, 0x6e, 0x63]), // "Rebalanc" discriminator
        allocationData,
      ]),
    });

    const tx = new Transaction().add(ix);
    const { blockhash } = await this.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.wallet.publicKey;
    tx.sign(this.wallet);

    const sig = await this.connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    await this.connection.confirmTransaction(sig, "confirmed");
    logger.info(`Rebalance confirmed: ${sig}`);
    return sig;
  }

  // ── Encode allocations into instruction bytes ──────────────────────────────
  private encodeAllocations(allocations: ProtocolAllocation[]): Buffer {
    const buf = Buffer.alloc(1 + allocations.length * 12);
    buf.writeUInt8(allocations.length, 0);
    allocations.forEach((a, i) => {
      const offset = 1 + i * 12;
      // Write protocol ID (4 bytes) + weight bps (4 bytes) + min apy bps (4 bytes)
      new BN(a.protocolId).toBuffer("le", 4).copy(buf, offset);
      new BN(Math.floor(a.weightBps)).toBuffer("le", 4).copy(buf, offset + 4);
      new BN(Math.floor(a.minApyBps)).toBuffer("le", 4).copy(buf, offset + 8);
    });
    return buf;
  }

  get managerPublicKey(): PublicKey {
    return this.wallet.publicKey;
  }

  get vaultPublicKey(): PublicKey {
    return this.vaultAddress;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────
export interface ProtocolAllocation {
  protocolId: number;      // e.g. 1=Kamino, 2=MarginFi, 3=Save, 4=Basis
  protocolName: string;
  weightBps: number;       // basis points out of 10000
  minApyBps: number;       // minimum acceptable APY in bps
  currentApy: number;      // live APY (decimal, e.g. 0.12 = 12%)
  riskScore: number;       // 0–100 (lower is safer)
}
