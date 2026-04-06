# ai-engine/rebalancer.py
# ARIA ML Rebalancer
# Uses XGBoost to predict APY for each protocol and compute optimal weights
# Features: utilization rate, TVL trend, funding rate, historical APY, risk score

import os
import json
import asyncio
import pickle
import numpy as np
from datetime import datetime
from typing import List, Dict, Optional
from pathlib import Path

try:
    import xgboost as xgb
    XGB_AVAILABLE = True
except ImportError:
    XGB_AVAILABLE = False
    print("XGBoost not installed — using linear fallback model")

# ── Protocol registry ─────────────────────────────────────────────────────────
PROTOCOLS = {
    1: {"name": "Kamino Lending",  "base_apy": 0.10},
    2: {"name": "MarginFi Lending","base_apy": 0.09},
    3: {"name": "Save (Solend)",   "base_apy": 0.08},
    4: {"name": "Basis Trade",     "base_apy": 0.15},
}

MODEL_PATH = Path("models/aria_model.pkl")
HISTORY_PATH = Path("data/history.json")

class ARIARebalancer:
    def __init__(self):
        self.model = None
        self.model_version = "v0"
        self.last_trained: Optional[str] = None
        Path("models").mkdir(exist_ok=True)
        Path("data").mkdir(exist_ok=True)
        self._load_model()

    def is_model_loaded(self) -> bool:
        return self.model is not None

    # ── Generate allocation signals ───────────────────────────────────────────
    def generate_signals(self, protocol_data: Dict) -> List:
        from main import AISignal

        signals = []
        raw_weights = []

        for pid, info in PROTOCOLS.items():
            data = protocol_data.get(pid, {})

            # Build feature vector
            features = self._build_features(pid, data)

            # Predict APY
            predicted_apy = self._predict_apy(features, info["base_apy"])

            # Confidence based on data freshness and model certainty
            confidence = self._compute_confidence(data)

            raw_weights.append({
                "pid": pid,
                "apy": predicted_apy,
                "confidence": confidence,
                "score": predicted_apy * confidence,
            })

        # Normalise weights
        total_score = sum(r["score"] for r in raw_weights)
        for r in raw_weights:
            w = r["score"] / total_score if total_score > 0 else 0.25
            # Cap any single protocol at 50%
            w = min(w, 0.50)
            pid = r["pid"]
            signals.append(
                AISignal(
                    protocolId=pid,
                    protocolName=PROTOCOLS[pid]["name"],
                    predictedApy=r["apy"],
                    confidence=r["confidence"],
                    recommendedWeight=w,
                    reasoning=self._build_reasoning(pid, r["apy"], r["confidence"]),
                )
            )

        # Re-normalise after capping
        total_w = sum(s.recommendedWeight for s in signals)
        for s in signals:
            s.recommendedWeight = s.recommendedWeight / total_w if total_w > 0 else 0.25

        return signals

    # ── Feature engineering ───────────────────────────────────────────────────
    def _build_features(self, protocol_id: int, data: Dict) -> np.ndarray:
        features = np.array([
            float(protocol_id),
            float(data.get("utilization_rate", 0.5)),
            float(data.get("tvl_usd", 1e8)) / 1e9,           # normalise to billions
            float(data.get("tvl_24h_change_pct", 0.0)),
            float(data.get("current_apy", PROTOCOLS[protocol_id]["base_apy"])),
            float(data.get("risk_score", 50)) / 100,
            float(data.get("funding_rate_8h", 0.0)),
            float(datetime.utcnow().hour) / 24,               # time of day
            float(datetime.utcnow().weekday()) / 7,           # day of week
        ], dtype=np.float32)
        return features

    # ── APY prediction ────────────────────────────────────────────────────────
    def _predict_apy(self, features: np.ndarray, base_apy: float) -> float:
        if self.model is not None and XGB_AVAILABLE:
            try:
                pred = self.model.predict(features.reshape(1, -1))[0]
                return float(max(0.03, min(0.50, pred)))
            except Exception as e:
                print(f"Model prediction error: {e}")

        # Fallback linear model: utilization rate drives APY
        util = features[1]
        tvl_factor = 1.0 - (features[2] * 0.1)  # larger TVL = slightly lower APY
        return float(base_apy * (1 + util * 0.5) * tvl_factor)

    # ── Confidence score ──────────────────────────────────────────────────────
    def _compute_confidence(self, data: Dict) -> float:
        if not data:
            return 0.3  # low confidence when no data

        confidence = 0.8  # base

        # Reduce confidence for high utilization (liquidity risk)
        util = data.get("utilization_rate", 0.5)
        if util > 0.85:
            confidence -= 0.3

        # Reduce for TVL drops
        tvl_change = data.get("tvl_24h_change_pct", 0)
        if tvl_change < -5:
            confidence -= 0.2

        # Reduce for high risk score
        risk = data.get("risk_score", 50)
        if risk > 60:
            confidence -= 0.15

        return float(max(0.1, min(1.0, confidence)))

    # ── Human-readable reasoning ──────────────────────────────────────────────
    def _build_reasoning(self, pid: int, apy: float, confidence: float) -> str:
        name = PROTOCOLS[pid]["name"]
        conf_label = "high" if confidence > 0.7 else "medium" if confidence > 0.4 else "low"
        return (
            f"{name}: predicted APY {apy*100:.2f}%, "
            f"confidence {conf_label} ({confidence:.2f})"
        )

    # ── Train XGBoost model ───────────────────────────────────────────────────
    async def train_async(self):
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._train)

    def _train(self):
        if not XGB_AVAILABLE:
            print("XGBoost unavailable — skipping training")
            return

        print("Training ARIA XGBoost model...")

        # Load historical data
        history = self._load_history()
        if len(history) < 10:
            print(f"Insufficient history ({len(history)} samples) — using base model")
            self._create_base_model()
            return

        # Build training set
        X, y = [], []
        for record in history:
            for pid in PROTOCOLS:
                data = record.get("protocols", {}).get(str(pid), {})
                if not data:
                    continue
                features = self._build_features(pid, data)
                actual_apy = data.get("actual_apy_24h", PROTOCOLS[pid]["base_apy"])
                X.append(features)
                y.append(actual_apy)

        if len(X) < 5:
            self._create_base_model()
            return

        X_arr = np.array(X, dtype=np.float32)
        y_arr = np.array(y, dtype=np.float32)

        self.model = xgb.XGBRegressor(
            n_estimators=100,
            max_depth=4,
            learning_rate=0.1,
            subsample=0.8,
            random_state=42,
        )
        self.model.fit(X_arr, y_arr)

        # Save model
        MODEL_PATH.parent.mkdir(exist_ok=True)
        with open(MODEL_PATH, "wb") as f:
            pickle.dump(self.model, f)

        self.model_version = f"v{datetime.utcnow().strftime('%Y%m%d_%H%M')}"
        self.last_trained = datetime.utcnow().isoformat()
        print(f"Model trained on {len(X)} samples. Version: {self.model_version}")

    def _create_base_model(self):
        """Create a simple base model from synthetic data for cold start."""
        if not XGB_AVAILABLE:
            return
        np.random.seed(42)
        n = 200
        X = np.random.rand(n, 9).astype(np.float32)
        # Simulate: APY increases with utilization, decreases with risk
        y = 0.06 + X[:, 1] * 0.12 - X[:, 5] * 0.05 + np.random.rand(n) * 0.02
        y = np.clip(y, 0.03, 0.40).astype(np.float32)
        self.model = xgb.XGBRegressor(n_estimators=50, max_depth=3, random_state=42)
        self.model.fit(X, y)
        self.model_version = "v0-base"
        self.last_trained = datetime.utcnow().isoformat()
        print("Base model created from synthetic data")

    def _load_model(self):
        if MODEL_PATH.exists():
            try:
                with open(MODEL_PATH, "rb") as f:
                    self.model = pickle.load(f)
                self.model_version = "v-loaded"
                self.last_trained = datetime.fromtimestamp(
                    MODEL_PATH.stat().st_mtime
                ).isoformat()
                print(f"Model loaded from {MODEL_PATH}")
            except Exception as e:
                print(f"Failed to load model: {e}")

    def _load_history(self) -> list:
        if HISTORY_PATH.exists():
            with open(HISTORY_PATH) as f:
                return json.load(f).get("history", [])
        return []
