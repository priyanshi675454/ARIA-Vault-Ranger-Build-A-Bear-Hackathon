# ai-engine/data_collector.py
# Fetches live protocol metrics for the AI engine feature pipeline

import asyncio
import aiohttp
from typing import Dict
from datetime import datetime

class ProtocolDataCollector:

    async def fetch_all(self) -> Dict[int, Dict]:
        """Fetch metrics for all 4 protocols concurrently."""
        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=10)
        ) as session:
            results = await asyncio.gather(
                self._fetch_kamino(session),
                self._fetch_marginfi(session),
                self._fetch_save(session),
                self._fetch_basis(session),
                return_exceptions=True,
            )

        data = {}
        for i, result in enumerate(results, start=1):
            if isinstance(result, Exception):
                print(f"Protocol {i} fetch error: {result}")
                data[i] = {}
            else:
                data[i] = result
        return data

    async def _fetch_kamino(self, session) -> Dict:
        try:
            async with session.get(
                "https://api.kamino.finance/v2/lending/markets"
            ) as resp:
                data = await resp.json()
                market = data.get("markets", [{}])[0]
                return {
                    "utilization_rate": float(market.get("utilizationRate", 0.5)),
                    "tvl_usd": float(market.get("totalDepositedUsd", 1e8)),
                    "tvl_24h_change_pct": 0.0,
                    "current_apy": float(market.get("lendApy", 0.10)),
                    "risk_score": 35,
                    "funding_rate_8h": 0.0,
                    "fetched_at": datetime.utcnow().isoformat(),
                }
        except Exception:
            return {"current_apy": 0.10, "risk_score": 40}

    async def _fetch_marginfi(self, session) -> Dict:
        try:
            async with session.get(
                "https://production.marginfi.com/v1/banks"
            ) as resp:
                data = await resp.json()
                banks = data.get("banks", [])
                usdc = next(
                    (b for b in banks
                     if b.get("mint") == "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
                    {}
                )
                return {
                    "utilization_rate": float(usdc.get("utilizationRate", 0.5)),
                    "tvl_usd": float(usdc.get("totalDepositsUsd", 5e7)),
                    "tvl_24h_change_pct": 0.0,
                    "current_apy": float(usdc.get("depositApy", 0.09)),
                    "risk_score": 30,
                    "funding_rate_8h": 0.0,
                    "fetched_at": datetime.utcnow().isoformat(),
                }
        except Exception:
            return {"current_apy": 0.09, "risk_score": 35}

    async def _fetch_save(self, session) -> Dict:
        try:
            async with session.get(
                "https://api.solend.fi/v1/reserves?scope=solend"
            ) as resp:
                data = await resp.json()
                reserves = data.get("results", [])
                usdc_r = next(
                    (r for r in reserves
                     if r.get("reserve", {}).get("lendingMarketOwner") is not None),
                    {}
                )
                supply_apy = float(
                    usdc_r.get("rates", {}).get("supplyInterest", "0.08")
                )
                return {
                    "utilization_rate": 0.55,
                    "tvl_usd": 3e7,
                    "tvl_24h_change_pct": 0.0,
                    "current_apy": supply_apy,
                    "risk_score": 40,
                    "funding_rate_8h": 0.0,
                    "fetched_at": datetime.utcnow().isoformat(),
                }
        except Exception:
            return {"current_apy": 0.08, "risk_score": 40}

    async def _fetch_basis(self, session) -> Dict:
        """Fetch SOL funding rate from Binance futures as proxy."""
        try:
            async with session.get(
                "https://fapi.binance.com/fapi/v1/fundingRate",
                params={"symbol": "SOLUSDT", "limit": 1},
            ) as resp:
                data = await resp.json()
                rate = float(data[0]["fundingRate"]) if data else 0.0001
                return {
                    "utilization_rate": 0.0,
                    "tvl_usd": 0,
                    "tvl_24h_change_pct": 0.0,
                    "current_apy": rate * 3 * 365,
                    "risk_score": 30 if rate > 0 else 70,
                    "funding_rate_8h": rate,
                    "fetched_at": datetime.utcnow().isoformat(),
                }
        except Exception:
            return {"current_apy": 0.12, "risk_score": 35, "funding_rate_8h": 0.0001}
