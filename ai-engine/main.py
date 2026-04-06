# ai-engine/main.py
# ARIA AI Rebalancing Engine
# FastAPI server that exposes /signals endpoint with ML-predicted allocations
# Called by the TypeScript vault controller every rebalance cycle

import os
import json
import asyncio
from datetime import datetime
from typing import Dict, List
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
from dotenv import load_dotenv

from risk_scorer import RiskScorer
from rebalancer import ARIARebalancer
from data_collector import ProtocolDataCollector

load_dotenv()

app = FastAPI(
    title="ARIA AI Engine",
    description="Adaptive Risk-weighted Intelligence Allocator — ML Signals",
    version="1.0.0",
)

# ── Global instances ──────────────────────────────────────────────────────────
scorer = RiskScorer()
rebalancer = ARIARebalancer()
collector = ProtocolDataCollector()

# ── Response models ───────────────────────────────────────────────────────────
class AISignal(BaseModel):
    protocolId: int
    protocolName: str
    predictedApy: float
    confidence: float        # 0–1
    recommendedWeight: float # 0–1
    reasoning: str

class SignalsResponse(BaseModel):
    timestamp: str
    signals: List[AISignal]
    blendedApyEstimate: float
    modelVersion: str

class HealthResponse(BaseModel):
    status: str
    modelLoaded: bool
    lastUpdated: str

# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok",
        modelLoaded=rebalancer.is_model_loaded(),
        lastUpdated=rebalancer.last_trained or "never",
    )

@app.get("/signals", response_model=SignalsResponse)
async def get_signals():
    """
    Returns ML-predicted allocation signals for all protocols.
    Called every hour by the TypeScript vault controller.
    """
    try:
        # Collect latest on-chain and API data
        protocol_data = await collector.fetch_all()

        # Generate ML signals
        signals = rebalancer.generate_signals(protocol_data)

        blended = sum(s.predictedApy * s.recommendedWeight for s in signals)

        return SignalsResponse(
            timestamp=datetime.utcnow().isoformat(),
            signals=signals,
            blendedApyEstimate=blended,
            modelVersion=rebalancer.model_version,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/train")
async def trigger_training():
    """Manually trigger model retraining."""
    asyncio.create_task(rebalancer.train_async())
    return {"status": "training started"}

@app.get("/history")
async def get_history():
    """Return last 30 days of vault performance."""
    try:
        with open("data/history.json") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"history": []}

# ── Startup: train model if not already trained ───────────────────────────────
@app.on_event("startup")
async def startup():
    print("ARIA AI Engine starting...")
    if not rebalancer.is_model_loaded():
        print("Training initial model...")
        await rebalancer.train_async()
    print("Ready to serve signals ✓")

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("AI_ENGINE_PORT", "8000")),
        reload=False,
        log_level="info",
    )
