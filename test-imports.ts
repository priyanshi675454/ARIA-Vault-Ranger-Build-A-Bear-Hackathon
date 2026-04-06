// Test script to debug imports
import fs from "fs";
import { logger } from "./src/utils/logger";
console.log("✓ Logger imported");

import { RiskOracleClient } from "./src/oracle/risk-oracle";
console.log("✓ Risk Oracle imported");

import { KaminoProtocol } from "./src/protocols/kamino";
console.log("✓ Kamino imported");

import { MarginFiProtocol } from "./src/protocols/marginfi";
import { SaveProtocol } from "./src/protocols/save";
import { BasisTradeProtocol } from "./src/protocols/basis-trade";
import { ARIAAllocator } from "./src/vault/allocator";
console.log("✓ All protocol imports successful");

async function test() {
  console.log("Testing Kamino APY fetch...");
  try {
    const kamino = new KaminoProtocol();
    const apy = await kamino.getCurrentApy();
    console.log("✓ Kamino APY:", apy);
  } catch (e) {
    console.error("✗ Kamino error:", e);
  }
}

test().catch(e => console.error("Test failed:", e));

