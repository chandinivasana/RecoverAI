import re
from typing import Dict, Any, Tuple
from ..models import RecoveryAction, RiskLevel, DBPolicyConfig
from ..core.consent_registry import DPDPairConsentRegistry
from ..core.rate_limiter import AcquirerRateLimitManager

class PolicyEvaluationResult:
    def __init__(self, allowed: bool, policy_rule: str, reason: str, requires_escalation: bool = False, force_action: str = None):
        self.allowed = allowed
        self.policy_rule = policy_rule
        self.reason = reason
        self.requires_escalation = requires_escalation
        self.force_action = force_action

class PolicyRules:
    ADVERSARIAL_PATTERNS = [
        r"ignore\s+(all\s+)?(policies|instructions|rules|limits)",
        r"retry\s+(\u20b9|rs\.?|inr)?\s*[\d,]+\s*immediately",
        r"system\s*override",
        r"admin\s*mode",
        r"bypass\s*guardrails",
        r"execute\s*unconditionally"
    ]

    @staticmethod
    def check_adversarial_injection(payment_data: Dict[str, Any]) -> Tuple[bool, str]:
        reason_text = f"{payment_data.get('failure_reason', '')} {str(payment_data.get('metadata', ''))}".lower()
        for pattern in PolicyRules.ADVERSARIAL_PATTERNS:
            if re.search(pattern, reason_text, re.IGNORECASE):
                return True, f"Security Policy Triggered: Detected adversarial prompt injection pattern '{pattern}' in transaction metadata/failure reason."
        return False, ""

    @staticmethod
    def check_amount_limit(amount: float, max_autonomous_amount: float) -> Tuple[bool, str]:
        if amount > max_autonomous_amount:
            return False, f"Autonomous Limit Exceeded: Transaction amount ₹{amount:,.2f} exceeds configured autonomous recovery limit of ₹{max_autonomous_amount:,.2f}."
        return True, f"Transaction amount ₹{amount:,.2f} is within autonomous limit ₹{max_autonomous_amount:,.2f}."

    @staticmethod
    def check_retry_limit(current_retries: int, max_retries: int) -> Tuple[bool, str]:
        if current_retries >= max_retries:
            return False, f"Retry Quota Exhausted: Current retry count ({current_retries}) reached max autonomous limit ({max_retries})."
        return True, f"Retry count ({current_retries}) is below threshold ({max_retries})."

    @staticmethod
    def check_risk_level(risk_level: str, require_human_high_risk: bool) -> Tuple[bool, str]:
        if require_human_high_risk and risk_level in [RiskLevel.HIGH.value, RiskLevel.CRITICAL.value]:
            return False, f"Risk Policy: High transaction risk level '{risk_level}' mandates human operator sign-off."
        return True, "Risk level within autonomous tolerances."

    @staticmethod
    def check_unknown_failure(failure_type: str, escalate_unknown: bool) -> Tuple[bool, str]:
        if escalate_unknown and failure_type == "UNKNOWN":
            return False, "Safety Policy: Unclassified/Ambiguous failure reason requires human investigation."
        return True, "Failure type is recognized."

    @staticmethod
    def check_customer_consent(action: str, customer_id: str, customer_context: Dict[str, Any], require_consent: bool) -> Tuple[bool, str]:
        if action in [RecoveryAction.PAYMENT_LINK.value, RecoveryAction.ALTERNATE_METHOD.value]:
            if require_consent:
                # Check DPDP registry
                consent_res = DPDPairConsentRegistry.check_consent(customer_id)
                if not consent_res.get("allowed", True):
                    return False, consent_res.get("reason")
                if not customer_context.get("has_messaging_consent", True):
                    return False, "DPDP Act Privacy Policy: Direct customer messaging/nudge is blocked without explicit user communication consent."
        return True, "Customer DPDP communication consent verified."

    @staticmethod
    def check_acquirer_rate_limits(payment_method: str, error_code: str = "") -> Tuple[bool, Dict[str, Any]]:
        return AcquirerRateLimitManager.check_acquirer_capacity(payment_method, error_code)
