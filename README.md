# 🐻 ARIA Vault — Ranger Build-A-Bear Hackathon

**Adaptive Risk-weighted Intelligence Allocator**  
A production-ready USDC yield vault on Solana with ML-driven allocation and on-chain risk scoring.

Target APY: **18–28%** | Base asset: **USDC** | Tenor: **3-month rolling**

---

## Project Structure

```
ARIA-Vault/
├── src/
│   ├── vault/
│   │   ├── index.ts          ← Main vault controller (run this)
│   │   ├── ranger-client.ts  ← Ranger Earn integration
│   │   └── allocator.ts      ← ARIA allocation router
│   ├── oracle/
│   │   └── risk-oracle.ts    ← On-chain risk scoring
│   ├── protocols/
│   │   ├── kamino.ts         ← Kamino lending
│   │   ├── marginfi.ts       ← MarginFi lending
│   │   ├── save.ts           ← Save (Solend) lending
│   │   └── basis-trade.ts    ← Basis trade strategy
│   └── utils/
│       ├── solana.ts         ← Connection & wallet helpers
│       └── logger.ts         ← Winston logger
├── ai-engine/
│   ├── main.py               ← FastAPI server entry point
│   ├── rebalancer.py         ← XGBoost ML model
│   ├── data_collector.py     ← Protocol data fetcher
│   ├── risk_scorer.py        ← Risk scoring module
│   └── requirements.txt
├── scripts/
│   ├── simulate.ts           ← Dry-run simulator (no TX)
│   └── backtest.ts           ← 90-day backtest
├── docs/
│   └── strategy.md           ← Full strategy documentation
├── tests/
│   └── allocator.test.ts
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Prerequisites (install once)

- Windows 11 with WSL2 (Ubuntu)
- Node.js 20+
- Python 3.11+
- Git

---

## Quick Start

See `INSTALL.md` for full step-by-step Windows 11 setup guide.

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your wallet and Helius API key

# 3. Run simulation (safe — no transactions)
npm run simulate

# 4. Run backtest
npm run backtest

# 5. Start AI engine (separate terminal)
cd ai-engine && python main.py

# 6. Start vault controller (live mode)
npm run dev
```
