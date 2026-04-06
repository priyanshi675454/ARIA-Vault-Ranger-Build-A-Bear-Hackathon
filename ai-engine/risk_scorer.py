# ai-engine/risk_scorer.py
# Protocol risk scoring helper used by the AI engine

class RiskScorer:
    """Computes 0–100 risk score for a protocol. Lower = safer."""

    def score(self, utilization: float, tvl_change_pct: float,
              wallet_concentration: float = 0.1,
              peg_deviation: float = 0.0) -> int:

        tvl_risk  = max(0, min(100, -tvl_change_pct * 10))
        util_risk = max(0, min(100,
            80 + (utilization - 0.9) * 200 if utilization > 0.9
            else utilization * 88
        ))
        conc_risk = min(100, wallet_concentration * 100)
        peg_risk  = min(100, peg_deviation * 5000)

        score = (
            tvl_risk  * 0.35 +
            util_risk * 0.25 +
            conc_risk * 0.20 +
            peg_risk  * 0.20
        )
        return round(max(0, min(100, score)))
