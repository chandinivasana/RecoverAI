from collections import Counter
from typing import Any

from sqlalchemy.orm import Session

from ..models import DBPayment


class AnomalyDetector:
    @staticmethod
    def detect_anomalies(db: Session, lookback_count: int = 100) -> list[dict[str, Any]]:
        """
        Analyzes recent failed payments vs historical baseline to flag anomalies.
        """
        recent_payments = db.query(DBPayment).order_by(DBPayment.created_at.desc()).limit(lookback_count).all()
        if not recent_payments or len(recent_payments) < 20:
            return []

        # Compare first half (recent) vs second half (baseline)
        mid = len(recent_payments) // 2
        recent_window = recent_payments[:mid]
        baseline_window = recent_payments[mid:]

        recent_counts = Counter()
        for p in recent_window:
            err = p.error_code or "UNKNOWN"
            recent_counts[err] += 1

        baseline_counts = Counter()
        for p in baseline_window:
            err = p.error_code or "UNKNOWN"
            baseline_counts[err] += 1

        anomalies = []
        recent_total = len(recent_window)
        baseline_total = len(baseline_window)

        for err_code, r_count in recent_counts.items():
            r_rate = r_count / recent_total
            b_count = baseline_counts.get(err_code, 0)
            b_rate = (b_count / baseline_total) if baseline_total > 0 else 0.01

            # If rate has increased >= 2.2x and is significant (>15% of recent failures)
            if r_rate >= 0.15 and (r_rate / max(0.01, b_rate)) >= 2.0:
                multiplier = round(r_rate / max(0.01, b_rate), 1)
                anomalies.append({
                    "error_code": err_code,
                    "severity": "HIGH" if multiplier >= 3.0 else "MEDIUM",
                    "recent_rate_percent": round(r_rate * 100, 1),
                    "baseline_rate_percent": round(b_rate * 100, 1),
                    "increase_multiplier": multiplier,
                    "message": f"Anomaly Detected: {err_code} failure rate increased {multiplier}x from {round(b_rate*100,1)}% to {round(r_rate*100,1)}%. Potential bank/gateway degradation.",
                    "recommended_action": "Switch smart routing away from impacted gateway rail"
                })

        return anomalies
