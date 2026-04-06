# ARIA Vault — Complete Installation Guide
## Windows 11 + WSL2 Step-by-Step

Your path: C:\project_all\Blockchain\ARIA-Vault\
WSL path:  /mnt/c/project_all/Blockchain/ARIA-Vault/

---

## PHASE 1 — One-Time System Setup (do this once ever)

### Step 1.1 — Enable WSL2 (if not already)
Open PowerShell as Administrator, paste:
```
wsl --install
wsl --set-default-version 2
```
Restart your PC when prompted.

### Step 1.2 — Install Node.js 20 inside WSL
Open your WSL terminal (Ubuntu), paste these one by one:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
npm --version
```
You should see: v20.x.x and 10.x.x

### Step 1.3 — Install Python 3.11 inside WSL
```bash
sudo apt update
sudo apt install -y python3.11 python3.11-venv python3-pip
python3.11 --version
```
You should see: Python 3.11.x

### Step 1.4 — Install Git (if not already)
```bash
sudo apt install -y git
git --version
```

---

## PHASE 2 — Create the Project Folder

### Step 2.1 — Navigate to your project path
```bash
cd /mnt/c/project_all/Blockchain
```

### Step 2.2 — Create the ARIA-Vault folder
```bash
mkdir -p ARIA-Vault
cd ARIA-Vault
```

Your full path is now:
/mnt/c/project_all/Blockchain/ARIA-Vault/

### Step 2.3 — Create ALL subfolders
```bash
mkdir -p src/vault src/protocols src/oracle src/utils
mkdir -p ai-engine/models ai-engine/data
mkdir -p scripts docs tests config logs
```

### Step 2.4 — Verify folder structure
```bash
find . -type d | sort
```
You should see all the folders listed.

---

## PHASE 3 — Copy Project Files

### Step 3.1 — Open VS Code from WSL
```bash
code .
```
This opens VS Code pointing at your ARIA-Vault folder.

### Step 3.2 — Copy all files
All files are provided in the output zip. Copy each file into VS Code exactly as provided:

src/vault/index.ts          ← Main controller
src/vault/ranger-client.ts  ← Ranger integration
src/vault/allocator.ts      ← Allocation router
src/oracle/risk-oracle.ts   ← Risk oracle
src/protocols/kamino.ts
src/protocols/marginfi.ts
src/protocols/save.ts
src/protocols/basis-trade.ts
src/utils/solana.ts
src/utils/logger.ts
scripts/simulate.ts
scripts/backtest.ts
tests/allocator.test.ts
ai-engine/main.py
ai-engine/rebalancer.py
ai-engine/data_collector.py
ai-engine/risk_scorer.py
ai-engine/requirements.txt
package.json
tsconfig.json
.env.example
.gitignore
README.md
docs/strategy.md

---

## PHASE 4 — Install Node.js Dependencies

### Step 4.1 — Install all TypeScript packages
```bash
cd /mnt/c/project_all/Blockchain/ARIA-Vault
npm install
```
Wait for it to finish. This installs:
- @solana/web3.js (Solana SDK)
- @coral-xyz/anchor (Anchor framework)
- @kamino-finance/klend-sdk
- @marginfi/marginfi-client-v2
- axios, dotenv, winston, etc.

### Step 4.2 — Verify install succeeded
```bash
npm list --depth=0
```
You should see all packages listed without errors.

---

## PHASE 5 — Install Python AI Engine

### Step 5.1 — Create Python virtual environment
```bash
cd /mnt/c/project_all/Blockchain/ARIA-Vault/ai-engine
python3.11 -m venv venv
source venv/bin/activate
```
You will see (venv) appear in your terminal prompt.

### Step 5.2 — Install Python packages
```bash
pip install --upgrade pip
pip install -r requirements.txt
```
This installs: fastapi, uvicorn, xgboost, numpy, pandas, aiohttp, scikit-learn

### Step 5.3 — Verify install
```bash
python3 -c "import xgboost, fastapi, numpy; print('All OK')"
```
Should print: All OK

---

## PHASE 6 — Environment Configuration

### Step 6.1 — Copy env file
```bash
cd /mnt/c/project_all/Blockchain/ARIA-Vault
cp .env.example .env
```

### Step 6.2 — Get a free Helius API key
1. Go to: https://dev.helius.xyz/
2. Sign up (free — hackathon gives 1 month free)
3. Copy your API key

### Step 6.3 — Edit .env in VS Code
```bash
code .env
```

Fill in these values:

```
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY_HERE
HELIUS_API_KEY=YOUR_KEY_HERE
```

### Step 6.4 — Get a Solana wallet private key
Option A — Create new wallet with Solana CLI:
```bash
sudo apt install -y curl
sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"
export PATH="/root/.local/share/solana/install/active_release/bin:$PATH"
solana-keygen new --outfile ~/aria-wallet.json
cat ~/aria-wallet.json
```
Copy the array of numbers — that's your private key.

Option B — Export from Phantom:
In Phantom → Settings → Export Private Key → copy the base58 key

Paste into .env:
```
WALLET_PRIVATE_KEY=your_private_key_here
```

### Step 6.5 — Leave VAULT_ADDRESS blank for now
You will get this after deploying on Ranger Earn. Leave as:
```
VAULT_ADDRESS=your_ranger_vault_address_after_deployment
```

---

## PHASE 7 — Run the Simulator (Test Everything Works)

### Step 7.1 — Run the simulation (NO transactions, 100% safe)
```bash
cd /mnt/c/project_all/Blockchain/ARIA-Vault
npm run simulate
```

You should see a beautiful terminal output showing:
✓ Live protocol APYs (fetched from Kamino, MarginFi, Save APIs)
✓ Risk scores for each protocol
✓ ARIA allocation plan (% per protocol)
✓ Blended APY calculation
✓ Simulation report saved to logs/simulation-report.json

### Step 7.2 — Run the backtest
```bash
npm run backtest
```
You will see 90-day backtest results comparing ARIA vs Kamino-only benchmark.

---

## PHASE 8 — Run the AI Engine

Open a NEW WSL terminal window (keep the first one open).

### Step 8.1 — Activate venv and start
```bash
cd /mnt/c/project_all/Blockchain/ARIA-Vault/ai-engine
source venv/bin/activate
python3 main.py
```

You should see:
```
ARIA AI Engine starting...
Training initial model...
Ready to serve signals ✓
INFO: Uvicorn running on http://0.0.0.0:8000
```

### Step 8.2 — Test the AI engine
Open a third WSL terminal:
```bash
curl http://localhost:8000/health
curl http://localhost:8000/signals
```

You should get JSON responses with risk signals.

---

## PHASE 9 — Register Vault on Ranger Earn

### Step 9.1 — Go to Ranger Earn
https://earn.ranger.finance

### Step 9.2 — Connect your wallet
Use the wallet whose private key is in your .env

### Step 9.3 — Create a new vault
- Name: ARIA Vault
- Base asset: USDC
- Strategy: Multi-protocol adaptive yield
- Lock period: 3 months (required)

### Step 9.4 — Copy your vault address
Paste it into .env:
```
VAULT_ADDRESS=your_actual_vault_address_here
```

---

## PHASE 10 — Start Live Vault Controller

### Step 10.1 — Make sure AI engine is running (Phase 8)

### Step 10.2 — Start the vault controller
In your first WSL terminal:
```bash
cd /mnt/c/project_all/Blockchain/ARIA-Vault
npm run dev
```

You will see:
```
╔══════════════════════════════════════╗
║     ARIA Vault Controller v1.0.0     ║
╚══════════════════════════════════════╝
Running startup health check...
Health check passed ✓
Computing risk scores...
Computing new ARIA allocations...
━━━━━ ARIA ALLOCATION ━━━━━━━━━━━━━━━━
  Kamino Lending        35.0%  APY: 10.24%  Risk: 28/100
  MarginFi Lending      25.0%  APY: 9.87%   Risk: 31/100
  Save (Solend)         20.0%  APY: 8.34%   Risk: 38/100
  Basis Trade           20.0%  APY: 14.20%  Risk: 30/100
  Blended APY: 10.45%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Daily Workflow (after initial setup)

Every day, open WSL and run:

Terminal 1 (AI Engine):
```bash
cd /mnt/c/project_all/Blockchain/ARIA-Vault/ai-engine
source venv/bin/activate
python3 main.py
```

Terminal 2 (Vault Controller):
```bash
cd /mnt/c/project_all/Blockchain/ARIA-Vault
npm run dev
```

---

## Useful Commands

```bash
# Run simulation only (safe, no transactions)
npm run simulate

# Run 90-day backtest
npm run backtest

# Build TypeScript to JavaScript
npm run build

# View live logs
tail -f logs/aria-vault.log

# View simulation report
cat logs/simulation-report.json

# View allocation snapshots
tail -f logs/snapshots.jsonl
```

---

## Troubleshooting

Error: "Cannot find module '@solana/web3.js'"
→ Run: npm install

Error: "ModuleNotFoundError: No module named 'xgboost'"
→ Run: cd ai-engine && source venv/bin/activate && pip install -r requirements.txt

Error: "WALLET_PRIVATE_KEY not set"
→ Edit .env and add your key

Error: "Vault account not found on-chain"
→ You haven't deployed on Ranger Earn yet — run simulate instead

Error: code . doesn't open VS Code
→ Install VS Code Remote WSL extension from VS Code marketplace

---

## Hackathon Submission Checklist

[ ] Vault registered on Ranger Earn
[ ] .env filled with real wallet and Helius key
[ ] npm run simulate runs successfully
[ ] npm run backtest shows results
[ ] AI engine starts at localhost:8000
[ ] logs/simulation-report.json generated
[ ] docs/strategy.md complete
[ ] GitHub repo created and code pushed
[ ] 3-minute demo video recorded
[ ] Submit on Ranger Earn by April 17, 15:59 UTC
