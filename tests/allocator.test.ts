// tests/allocator.test.ts
// ARIA Vault Unit Tests

import { ARIAAllocator } from "../src/vault/allocator";
import { BasisTradeProtocol } from "../src/protocols/basis-trade";

// ── Mock environment ──────────────────────────────────────────────────────────
process.env.SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";
process.env.WALLET_PRIVATE_KEY = "11111111111111111111111111111111"; // dummy
process.env.MAX_RISK_THRESHOLD = "75";
process.env.MAX_SINGLE_PROTOCOL_ALLOCATION = "0.50";
process.env.MIN_APY_THRESHOLD = "0.10";
process.env.AI_ENGINE_URL = "http://localhost:9999"; // will fail — tests use fallback

describe("ARIAAllocator", () => {
  let allocator: ARIAAllocator;

  beforeEach(() => {
    allocator = new ARIAAllocator();
  });

  test("blended APY calculation is correct", () => {
    const allocations = [
      { protocolId: 1, protocolName: "Kamino", weightBps: 5000, minApyBps: 1000, currentApy: 0.10, riskScore: 30 },
      { protocolId: 2, protocolName: "MarginFi", weightBps: 5000, minApyBps: 1000, currentApy: 0.14, riskScore: 25 },
    ];
    const blended = allocator.computeBlendedApy(allocations);
    // 50% * 10% + 50% * 14% = 12%
    expect(blended).toBeCloseTo(0.12, 4);
  });

  test("blended APY with unequal weights", () => {
    const allocations = [
      { protocolId: 1, protocolName: "Kamino",   weightBps: 7000, minApyBps: 1000, currentApy: 0.10, riskScore: 30 },
      { protocolId: 4, protocolName: "Basis",    weightBps: 3000, minApyBps: 1000, currentApy: 0.20, riskScore: 30 },
    ];
    const blended = allocator.computeBlendedApy(allocations);
    // 70% * 10% + 30% * 20% = 13%
    expect(blended).toBeCloseTo(0.13, 4);
  });
});

describe("BasisTradeProtocol", () => {
  test("returns inactive when funding rate is zero", async () => {
    const basis = new BasisTradeProtocol();
    // Mock getFundingRate to return zero
    jest.spyOn(basis, "getFundingRate").mockResolvedValueOnce({
      market: "SOL-PERP",
      fundingRate8h: 0,
      fundingRateAnnualised: 0,
      nextFundingTime: Date.now(),
      isPositive: false,
    });

    const result = await basis.evaluateBasisOpportunity();
    expect(result.isActive).toBe(false);
    expect(result.expectedApy).toBe(0);
  });

  test("returns active when funding rate is above threshold", async () => {
    const basis = new BasisTradeProtocol();
    jest.spyOn(basis, "getFundingRate").mockResolvedValueOnce({
      market: "SOL-PERP",
      fundingRate8h: 0.01,   // 1% per 8h — well above 0.5% threshold
      fundingRateAnnualised: 10.95,
      nextFundingTime: Date.now(),
      isPositive: true,
    });

    const result = await basis.evaluateBasisOpportunity();
    expect(result.isActive).toBe(true);
    expect(result.expectedApy).toBeGreaterThan(0);
  });
});
