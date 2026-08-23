from typing import Any


class PaymentIntelligenceProvider:
    """Base interface for payment intelligence providers."""
    def get_intelligence(self, payment_data: dict[str, Any], customer_context: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

class BaselineProvider(PaymentIntelligenceProvider):
    """
    Standard deterministic payment intelligence provider.
    Uses heuristic rules based on failure error code and basic customer history.
    """
    def get_intelligence(self, payment_data: dict[str, Any], customer_context: dict[str, Any]) -> dict[str, Any]:
        past_successful = customer_context.get("past_successful_payments", 0)
        past_failed = customer_context.get("past_failed_payments", 0)

        # Base probability calculation
        total_txns = past_successful + past_failed
        cust_ratio = (past_successful / total_txns) if total_txns > 0 else 0.5

        confidence = 0.65

        return {
            "provider": "baseline",
            "gateway_health_score": 0.85,
            "smart_routing_available": False,
            "suggested_optimal_retry_delay_sec": 30,
            "customer_propensity_score": round(cust_ratio, 2),
            "intelligence_confidence": confidence,
            "vulcan_signals_applied": False
        }

class VulcanAdapter(PaymentIntelligenceProvider):
    """
    Razorpay Vulcan Payment Intelligence Adapter.
    Enhances failure diagnosis with smart bank-uptime telemetry, routing-health metrics,
    UPI handle health, and dynamic recovery window estimation.
    """
    def get_intelligence(self, payment_data: dict[str, Any], customer_context: dict[str, Any]) -> dict[str, Any]:
        method = payment_data.get("payment_method", "upi").lower()
        error_code = str(payment_data.get("error_code", "")).upper()
        
        # Vulcan smart telemetry simulation
        gateway_health = 0.96 if "TIMEOUT" not in error_code else 0.72
        upi_vpa_validity = True if method == "upi" else None
        recommended_alternate = "netbanking" if method == "upi" and "BANK_DOWN" in error_code else "upi"
        
        past_success = customer_context.get("past_successful_payments", 5)
        tenure = customer_context.get("tenure_months", 6)
        customer_propensity = min(0.98, 0.4 + (past_success * 0.05) + (tenure * 0.02))
        
        optimal_delay = 15 if "TIMEOUT" in error_code else 300 if "INSUFFICIENT" in error_code else 60
        
        return {
            "provider": "razorpay_vulcan",
            "gateway_health_score": round(gateway_health, 2),
            "upi_vpa_validity": upi_vpa_validity,
            "smart_routing_available": True,
            "recommended_alternate_rail": recommended_alternate,
            "suggested_optimal_retry_delay_sec": optimal_delay,
            "customer_propensity_score": round(customer_propensity, 2),
            "intelligence_confidence": 0.91,
            "vulcan_signals_applied": True,
            "bank_downtime_clearing_eta_sec": optimal_delay if gateway_health < 0.8 else 0
        }

def get_intelligence_provider(vulcan_enabled: bool = True) -> PaymentIntelligenceProvider:
    if vulcan_enabled:
        return VulcanAdapter()
    return BaselineProvider()
