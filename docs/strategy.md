# ARIA Vault — Strategy Documentation
### Ranger Build-A-Bear Hackathon | Main Track Submission

---

## 1. Strategy Thesis

**ARIA (Adaptive Risk-weighted Intelligence Allocator)** is a USDC-denominated yield vault on Solana that earns superior risk-adjusted returns by:

1. **Dynamically allocating** across 3–4 non-correlated yield sources (lending markets + basis trade)
2. **Scoring each protocol in real-time** using an on-chain risk oracle that detects danger signals before a crisis spreads
3. **Predicting optimal weights** using an XGBoost ML model trained on historical APY and utilization data
4. **Auto-exiting** any protocol whose risk score breaches a threshold, protecting principal

**Target APY:** 18–28% (blended, net of fees)  
**Base asset:** USDC  
**Tenor:** 3-month rolling lock, reassessed quarterly  
**Minimum APY floor:** 10% (hardcoded guard in allocator)

---

## 2. Yield Sources

All four yield sources pass the prize eligibility requirements — no DEX LP, no junior tranche, no circular yield, no high-leverage looping.

### 2.1 Kamino Finance Lending (~10–14% APY)
- Deposits USDC into Kamino's main USDC lending market
- Earns supply interest from borrowers paying to leverage long
- Risk: utilization spike → withdrawal queue (mitigated: oracle monitors utilization hourly)

### 2.2 MarginFi Lending (~9–12% APY)
- Deposits USDC into MarginFi's USDC bank
- Earns supply APY from margin traders
- Risk: same as Kamino — oracle tracks utilization rate

### 2.3 Save (Solend) Lending (~8–10% APY)
- Third lending market for diversification
- Independently managed, different risk profile from Kamino/MarginFi
- Risk: slightly older protocol, conservatively weighted

### 2.4 Basis Trade (~12–25% APY when active)
- **Long SOL spot + Short SOL-PERP** = delta-neutral position that earns funding rate
- Only activated when SOL funding rate > 0.5% per 8 hours (positive carry)
- When funding rate is negative, basis trade weight drops to 0% automatically
- Risk: execution slippage, funding rate reversal (mitigated: threshold filter + rapid exit)

---

## 3. Risk Management

### 3.1 On-Chain Risk Oracle
The core innovation. Publishes a 0–100 risk score for each protocol every hour. Inputs:

| Signal | Weight | Threshold |
|---|---|---|
| TVL 24h change | 35% | Drop >10% = high risk |
| Utilization rate | 25% | >90% = critical |
| Wallet concentration | 20% | Top wallet >30% = risk |
| USDC peg deviation | 20% | >$0.01 = danger |

Any protocol scoring ≥ 75 is **automatically excluded** from allocations that cycle.

### 3.2 Allocation Caps
- No single protocol can receive more than **50% of vault assets**
- This protects against single-protocol failure destroying the entire vault

### 3.3 APY Floor Guard
- If the blended APY of eligible protocols falls below **10%**, the vault holds USDC idle rather than deploy into suboptimal yield
- This prevents chasing yield into high-risk environments

### 3.4 Drawdown Protection
- The vault does not use leverage on the lending side
- Basis trade is delta-neutral — directional SOL price risk is fully hedged
- Maximum theoretical drawdown on lending: utilization spike locking withdrawals temporarily (not principal loss)

### 3.5 Rebalancing Frequency
- Full rebalance cycle: every **1 hour**
- Emergency exit (risk score breach): **immediate** — triggered on next cycle
- Quarterly reassessment: per Ranger Earn tenor requirements

---

## 4. Technical Architecture

```
User USDC deposit
      │
      ▼
Ranger Earn Vault (on-chain)
      │
      ├──► ARIA Vault Controller (TypeScript, runs off-chain)
      │         │
      │         ├──► Risk Oracle (fetches metrics → publishes score on Solana)
      │         ├──► AI Engine (Python/FastAPI → XGBoost APY prediction)
      │         └──► Allocation Router (combines risk + AI → optimal weights)
      │
      └──► Ranger Earn rebalance() CPI instruction
                │
                ├──► Kamino USDC Market
                ├──► MarginFi USDC Bank  
                ├──► Save USDC Reserve
                └──► Basis Trade (Spot + Perp hedge)
```

### Tech Stack
- **On-chain:** Solana / Ranger Earn vault program / Anchor
- **Vault controller:** TypeScript + @solana/web3.js
- **AI engine:** Python 3.11 / FastAPI / XGBoost
- **Monitoring:** Winston logging + JSONL snapshots
- **Infrastructure:** AWS (hackathon credits)

---

## 5. Position Sizing & Rebalancing Logic

The allocation weight for protocol `i` is computed as:

```
raw_weight_i = risk_factor_i × ai_confidence_i × predicted_apy_i

where:
  risk_factor_i     = (100 - risk_score_i) / 100
  ai_confidence_i   = XGBoost model confidence for protocol i
  predicted_apy_i   = ML-predicted 24h forward APY

weights are then normalised to sum to 100%
each weight is capped at MAX_SINGLE_PROTOCOL (50%)
```

---

## 6. Backtest Results (90-day simulation)

| Metric | ARIA Strategy | Benchmark (Kamino only) |
|---|---|---|
| 90-day return | ~4.5% | ~2.5% |
| Annualised APY | ~20% | ~10% |
| Sharpe ratio | ~2.1 | ~1.4 |
| Max drawdown | <0.5% | <0.5% |
| Alpha | +~10% | — |

*Backtest uses synthetic data with realistic APY distributions. Live verification via on-chain addresses provided.*

---

## 7. Production Viability

- **Scalability:** Allocator logic is protocol-agnostic — new yield sources can be added by registering in `PROTOCOLS` map and implementing a simple `getCurrentApy()` interface
- **Operational complexity:** Single TypeScript process + Python FastAPI server. Can run on a $5/month VPS or AWS EC2 t3.micro (covered by hackathon credits)
- **Monitoring:** All cycles logged to JSONL. Telegram alerts optional
- **Regulatory:** USDC-only, no leverage, no synthetics — cleanest risk profile possible

---

## 8. Novelty & Innovation

What has NOT been built before on Solana:

1. **On-chain risk oracle** that publishes composite risk scores for lending protocols — this is a standalone primitive other vaults could consume
2. **ML-predicted APY allocation** using XGBoost on live protocol utilization features
3. **Basis trade integration gated by funding rate threshold** — active only when carry is positive, idle otherwise
4. **Unified multi-source allocator** with automatic emergency exit built into the rebalancing loop

---

## 9. Team

Solo builder — developer background, strong coding, full-stack TypeScript + Python.

---

## 10. On-Chain Verification

Vault address: `[submitted via Ranger Earn at deployment]`  
Manager wallet: `[from .env WALLET_PRIVATE_KEY public key]`  
Build window activity: Mar 9 – Apr 17 2025  
Verifiable via Solscan: all rebalance transactions signed by manager wallet
