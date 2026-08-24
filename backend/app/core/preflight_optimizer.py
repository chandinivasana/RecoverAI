"""
Pre-Flight Checkout Optimization Engine.
Evaluates acquirer bank circuit breakers, real-time method health, customer risk,
and prevents transaction failures BEFORE the customer clicks 'Pay'.
"""
import uuid
from datetime import datetime
from typing import Any

from ..core.rate_limiter import AcquirerRateLimitManager
from ..models import MethodReliabilityScore, PreflightEvaluateRequest, PreflightEvaluateResponse

# Simulated Indian Banking & Acquirer Baseline Matrix
BANK_HEALTH_MATRIX: dict[str, dict[str, Any]] = {
    "HDFC": {"upi_success": 0.94, "card_success": 0.91, "netbanking_success": 0.88, "latency_ms": 380, "status": "OPTIMAL"},
    "ICICI": {"upi_success": 0.96, "card_success": 0.93, "netbanking_success": 0.90, "latency_ms": 320, "status": "OPTIMAL"},
    "SBI": {"upi_success": 0.82, "card_success": 0.89, "netbanking_success": 0.79, "latency_ms": 780, "status": "DEGRADED"},
    "AXIS": {"upi_success": 0.93, "card_success": 0.90, "netbanking_success": 0.86, "latency_ms": 410, "status": "OPTIMAL"},
    "KOTAK": {"upi_success": 0.95, "card_success": 0.92, "netbanking_success": 0.91, "latency_ms": 340, "status": "OPTIMAL"},
}

METHOD_BASE_LATENCY = {
    "upi": 420,
    "card": 650,
    "netbanking": 1100,
    "wallet": 280,
    "emi": 1400,
}


class PreflightOptimizer:
    @staticmethod
    def evaluate(req: PreflightEvaluateRequest) -> PreflightEvaluateResponse:
        bank = (req.bank_code or "HDFC").upper()
        bank_data = BANK_HEALTH_MATRIX.get(bank, BANK_HEALTH_MATRIX["HDFC"])
        
        # Check live circuit breaker via AcquirerRateLimitManager
        method = req.payment_method.lower()
        allowed, _ = AcquirerRateLimitManager.check_acquirer_capacity(method, "ACQUIRER_TIMEOUT")
        circuit_open = not allowed
        
        # Calculate method ranking
        rankings: list[MethodReliabilityScore] = []
        for m in ["upi", "card", "netbanking", "wallet", "emi"]:
            key = f"{m}_success"
            base_prob = bank_data.get(key, 0.90)
            
            # Penalize if circuit is tripped
            if m == method and circuit_open:
                base_prob = max(0.1, base_prob - 0.5)
            
            # High amount penalties
            if req.amount > 50000 and m == "upi":
                base_prob = max(0.4, base_prob - 0.25)
            elif req.amount > 50000 and m in ["netbanking", "card"]:
                base_prob = min(0.98, base_prob + 0.05)

            lat = METHOD_BASE_LATENCY.get(m, 500)
            if bank_data.get("status") == "DEGRADED":
                lat += 350

            status = "OUTAGE" if base_prob < 0.4 else ("DEGRADED" if base_prob < 0.85 else "OPTIMAL")
            rankings.append(MethodReliabilityScore(
                payment_method=m,
                predicted_success_rate=round(base_prob, 3),
                latency_ms=lat,
                health_status=status,
                recommended=False
            ))

        # Sort rankings descending by predicted success
        rankings.sort(key=lambda x: x.predicted_success_rate, reverse=True)
        if rankings:
            rankings[0].recommended = True

        best_method = rankings[0].payment_method
        primary_score = next((r for r in rankings if r.payment_method == method), rankings[0])
        
        reasons: list[str] = []
        preventative_actions: list[str] = []
        
        if circuit_open:
            recommendation = "SMART_ROUTE"
            primary_risk = "HIGH"
            reasons.append(f"Acquirer circuit breaker for {method.upper()} has tripped due to burst errors.")
            preventative_actions.append(f"Auto-rerouting from {method} to {best_method} via secondary acquirer tunnel.")
        elif bank_data.get("status") == "DEGRADED":
            recommendation = "WARN_DEGRADED" if primary_score.predicted_success_rate >= 0.8 else "REORDER_METHODS"
            primary_risk = "MEDIUM"
            reasons.append(f"{bank} bank rail is experiencing intermittent degradation ({bank_data['latency_ms']}ms average latency).")
            preventative_actions.append(f"Surface {best_method.upper()} as default 1-click option on checkout.")
        elif req.amount > 100000:
            recommendation = "SMART_ROUTE"
            primary_risk = "LOW"
            reasons.append(f"High-ticket transaction (₹{req.amount:,.2f}) requires multi-acquirer priority routing.")
            preventative_actions.append("Pre-warm secondary 3DS authentication tunnel.")
        else:
            recommendation = "ALLOW"
            primary_risk = "LOW"
            reasons.append(f"Optimal checkout conditions for {method.upper()} on {bank}.")
            preventative_actions.append("Direct standard processing allowed.")

        fallback = best_method if best_method != method else (rankings[1].payment_method if len(rankings) > 1 else "card")

        return PreflightEvaluateResponse(
            request_id=f"pfl_{uuid.uuid4().hex[:10]}",
            merchant_id=req.merchant_id or "merch_default",
            recommendation=recommendation,
            primary_method_risk=primary_risk,
            success_probability=primary_score.predicted_success_rate,
            predicted_latency_ms=primary_score.latency_ms,
            recommended_method=best_method,
            suggested_fallback=fallback,
            preventative_actions=preventative_actions,
            method_rankings=rankings,
            circuit_breaker_active=circuit_open,
            reasons=reasons,
            timestamp=datetime.utcnow()
        )
