from typing import Any

from ..core.vulcan_adapter import get_intelligence_provider
from ..models import FailureCategory, RiskLevel


class PaymentAnalyst:
    """
    Agent 1: Payment Analyst
    Classifies payment failures using structured payment signals, deterministic rules,
    epistemic uncertainty modeling, and payment intelligence (Vulcan / Baseline).
    """

    ERROR_MAP = {
        "GATEWAY_TIMEOUT": FailureCategory.TEMPORARY_NETWORK_FAILURE,
        "BANK_NETWORK_DOWN": FailureCategory.TEMPORARY_NETWORK_FAILURE,
        "TIMEOUT": FailureCategory.TEMPORARY_NETWORK_FAILURE,
        "CONNECTION_RESET": FailureCategory.TEMPORARY_NETWORK_FAILURE,
        
        "INSUFFICIENT_FUNDS": FailureCategory.INSUFFICIENT_FUNDS,
        "LOW_BALANCE": FailureCategory.INSUFFICIENT_FUNDS,
        "LIMIT_EXCEEDED": FailureCategory.INSUFFICIENT_FUNDS,
        
        "CARD_EXPIRED": FailureCategory.PAYMENT_METHOD_FAILURE,
        "INCORRECT_CVV": FailureCategory.PAYMENT_METHOD_FAILURE,
        "INCORRECT_PIN": FailureCategory.PAYMENT_METHOD_FAILURE,
        "VPA_INVALID": FailureCategory.PAYMENT_METHOD_FAILURE,
        "METHOD_NOT_SUPPORTED": FailureCategory.PAYMENT_METHOD_FAILURE,
        
        "USER_CANCELLED": FailureCategory.CHECKOUT_ABANDONMENT,
        "BACK_PRESSED": FailureCategory.CHECKOUT_ABANDONMENT,
        "SESSION_EXPIRED": FailureCategory.CHECKOUT_ABANDONMENT,
        
        "SUSPICIOUS_ACTIVITY": FailureCategory.HIGH_RISK,
        "FRAUD_SUSPECTED": FailureCategory.HIGH_RISK,
        "BLOCKED_CARD": FailureCategory.HIGH_RISK,
    }

    @staticmethod
    def analyze(payment_data: dict[str, Any], customer_context: dict[str, Any], vulcan_enabled: bool = True) -> dict[str, Any]:
        reason_raw = str(payment_data.get("failure_reason", "")).strip()
        error_code = str(payment_data.get("error_code", "")).upper()
        amount = float(payment_data.get("amount", 0.0))
        customer_risk = float(customer_context.get("risk_score", 0.1))

        # 1. Deterministic error code mapping
        failure_type = PaymentAnalyst.ERROR_MAP.get(error_code)

        # 2. Text heuristics if error code was generic
        if not failure_type:
            reason_lower = reason_raw.lower()
            if any(k in reason_lower for k in ["timeout", "gateway", "network", "bank down", "unresponsive"]):
                failure_type = FailureCategory.TEMPORARY_NETWORK_FAILURE
            elif any(k in reason_lower for k in ["insufficient", "balance", "limit", "low fund"]):
                failure_type = FailureCategory.INSUFFICIENT_FUNDS
            elif any(k in reason_lower for k in ["card expired", "invalid pin", "wrong cvv", "invalid vpa", "vpa not found", "otp fail"]):
                failure_type = FailureCategory.PAYMENT_METHOD_FAILURE
            elif any(k in reason_lower for k in ["cancelled by user", "abandoned", "back button", "session timeout"]):
                failure_type = FailureCategory.CHECKOUT_ABANDONMENT
            elif any(k in reason_lower for k in ["fraud", "suspicious", "stolen", "blacklisted", "unauthorized"]):
                failure_type = FailureCategory.HIGH_RISK
            else:
                failure_type = FailureCategory.UNKNOWN

        # 3. Epistemic Uncertainty Check (Signal Contradiction)
        is_conflicted = False
        uncertainty_reason = ""
        reason_lower = reason_raw.lower()
        if "timeout" in error_code.lower() and any(k in reason_lower for k in ["fraud", "stolen", "expired"]):
            is_conflicted = True
            uncertainty_reason = "Epistemic Uncertainty: Error code indicates network timeout, but diagnostic text flags card security failure. Signals conflict."
        elif failure_type == FailureCategory.UNKNOWN:
            is_conflicted = True
            uncertainty_reason = "Epistemic Uncertainty: Unobserved diagnostic failure pattern. Agent voluntarily abstaining."

        # 4. Assess Risk Level
        if failure_type == FailureCategory.HIGH_RISK or customer_risk >= 0.70 or amount >= 100000:
            risk_level = RiskLevel.CRITICAL if amount >= 200000 else RiskLevel.HIGH
        elif customer_risk >= 0.35 or amount >= 30000:
            risk_level = RiskLevel.MEDIUM
        else:
            risk_level = RiskLevel.LOW

        # 5. Integrate Payment Intelligence signals (Vulcan / Baseline)
        provider = get_intelligence_provider(vulcan_enabled=vulcan_enabled)
        intel_signals = provider.get_intelligence(payment_data, customer_context)

        return {
            "failure_type": failure_type.value,
            "risk_level": risk_level.value,
            "risk_score": customer_risk,
            "has_epistemic_uncertainty": is_conflicted,
            "uncertainty_reason": uncertainty_reason,
            "intelligence_signals": intel_signals,
            "summary": f"Classified failure as {failure_type.value} with {risk_level.value} risk profile."
        }
