// src/utils/solana.ts
// Solana connection, wallet, and helper utilities for ARIA Vault

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import bs58 from "bs58";
import dotenv from "dotenv";
import { logger } from "./logger";

dotenv.config();

// ── Singleton connection ─────────────────────────────────────────────────────
let _connection: Connection | null = null;

export function getConnection(): Connection {
  if (!_connection) {
    const rpcUrl = process.env.SOLANA_RPC_URL!;
    _connection = new Connection(rpcUrl, {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 60000,
    });
    logger.info(`Connected to Solana: ${rpcUrl.split("?")[0]}`);
  }
  return _connection;
}

// ── Wallet loading ───────────────────────────────────────────────────────────
export function loadWallet(): Keypair {
  const privateKey = process.env.WALLET_PRIVATE_KEY;
  if (!privateKey) throw new Error("WALLET_PRIVATE_KEY not set in .env");

  try {
    const decoded = bs58.decode(privateKey);
    const kp = Keypair.fromSecretKey(decoded);
    logger.info(`Wallet loaded: ${kp.publicKey.toBase58()}`);
    return kp;
  } catch (e1) {
    // Try as JSON array fallback
    try {
      const arr = JSON.parse(privateKey);
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    } catch (e2) {
      // Generate a test keypair if key is invalid
      logger.warn(`Invalid wallet key, generating test keypair: ${e1}`);
      return Keypair.generate();
    }
  }
}


// ── Balance helpers ──────────────────────────────────────────────────────────
export async function getSolBalance(pubkey: PublicKey): Promise<number> {
  const conn = getConnection();
  const lamports = await conn.getBalance(pubkey);
  return lamports / LAMPORTS_PER_SOL;
}

export async function getTokenBalance(
  walletPubkey: PublicKey,
  mintPubkey: PublicKey
): Promise<number> {
  const conn = getConnection();
  try {
    const resp = await conn.getParsedTokenAccountsByOwner(walletPubkey, {
      mint: mintPubkey,
    });
    if (resp.value.length === 0) return 0;
    const info = resp.value[0].account.data.parsed.info.tokenAmount;
    return parseFloat(info.uiAmountString);
  } catch (e) {
    logger.warn(`Failed to get token balance: ${e}`);
    return 0;
  }
}

// ── USDC mint ────────────────────────────────────────────────────────────────
export const USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // mainnet USDC
);

// ── Transaction helper ───────────────────────────────────────────────────────
export async function sendTx(
  wallet: Keypair,
  tx: Transaction
): Promise<string> {
  const conn = getConnection();
  const sig = await sendAndConfirmTransaction(conn, tx, [wallet], {
    commitment: "confirmed",
  });
  logger.info(`Transaction confirmed: ${sig}`);
  return sig;
}

// ── Retry wrapper ────────────────────────────────────────────────────────────
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1000
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === retries - 1) throw e;
      logger.warn(`Retry ${i + 1}/${retries} after error: ${e}`);
      await sleep(delayMs * (i + 1));
    }
  }
  throw new Error("Max retries exceeded");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function pubkey(addr: string): PublicKey {
  return new PublicKey(addr);
}
