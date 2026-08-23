from typing import Dict, Any
from .rules import PolicyRules, PolicyEvaluationResult
from ..models import RecoveryAction, DBPolicyConfig

class PolicyEngine:
    """
    Deterministic Safety & Policy Enforcement Engine.
    Guarantees:
    - AI proposes -> Policy validates -> System executes.
    - Fails closed on any unexpected state, error, or violation.
    """
    # Escalation-class rules exist to route decisions to a human. A human
    # sign-off therefore satisfies them. HARD rules protect the system itself
    # (security, quotas, consent, partner-bank capacity) and bind even humans.
    ESCALATION_CLASS_RULES = ("MAX_AUTONOMOUS_AMOUNT", "HIGH_RISK_BLOCK", "UNKNOWN_FAILURE_ESCALATION")
    HARD_RULES = ("SECURITY_INJECTION_DEFENSE", "MAX_RETRY_LIMIT", "CUSTOMER_CONSENT_REQUIRED", "ACQUIRER_RATE_LIMIT_PROTECTION")

    @staticmethod
    def evaluate(
        recommended_action: str,
        payment_data: Dict[str, Any],
        customer_context: Dict[str, Any],
        config: DBPolicyConfig,
        dry_run: bool = False,
        human_approved: bool = False
    ) -> PolicyEvaluationResult:
        # dry_run: read-only evaluation (benchmarks, what-if simulation, replay).
        # It must not mutate shared state such as acquirer rate-limit counters,
        # otherwise repeated read-only passes change live results.
        #
        # human_approved: the action carries an explicit human sign-off, which
        # waives ONLY the escalation-class rules (amount cap, high risk,
        # unknown failure — the rules whose remedy IS a human). Hard rules
        # (injection defense, retry quota, DPDP consent, acquirer protection)
        # still block: even humans cannot override them.
        try:
            # 1. Stop action is always allowed safely
            if recommended_action == RecoveryAction.STOP.value:
                return PolicyEvaluationResult(
                    allowed=True,
                    policy_rule="SAFE_STOP",
                    reason="Safe termination of recovery: system chose not to act."
                )

            # 2. Adversarial Injection Check (Prompt injection defense)
            is_attack, attack_reason = PolicyRules.check_adversarial_injection(payment_data)
            if is_attack:
                return PolicyEvaluationResult(
                    allowed=False,
                    policy_rule="SECURITY_INJECTION_DEFENSE",
                    reason=attack_reason,
                    requires_escalation=True,
                    force_action=RecoveryAction.HUMAN_REVIEW.value
                )

            # 3. Maximum Autonomous Amount Threshold Check (escalation-class:
            # waived when a human has explicitly signed off)
            if not human_approved:
                amount = float(payment_data.get("amount", 0.0))
                max_amount = float(config.max_autonomous_amount)
                allowed_amount, amount_reason = PolicyRules.check_amount_limit(amount, max_amount)
                if not allowed_amount:
                    return PolicyEvaluationResult(
                        allowed=False,
                        policy_rule="MAX_AUTONOMOUS_AMOUNT",
                        reason=amount_reason,
                        requires_escalation=True,
                        force_action=RecoveryAction.HUMAN_REVIEW.value
                    )

            # 4. Retry Quota Limit Check (for retry actions)
            if recommended_action in [RecoveryAction.RETRY.value, RecoveryAction.DELAYED_RETRY.value]:
                current_retries = int(payment_data.get("retry_count", 0))
                max_retries = int(config.max_autonomous_retry_attempts)
                allowed_retry, retry_reason = PolicyRules.check_retry_limit(current_retries, max_retries)
                if not allowed_retry:
                    return PolicyEvaluationResult(
                        allowed=False,
                        policy_rule="MAX_RETRY_LIMIT",
                        reason=retry_reason,
                        requires_escalation=False,
                        force_action=RecoveryAction.STOP.value
                    )

            # 5. Risk Level Validation (escalation-class: waived on human sign-off)
            if not human_approved:
                risk_level = str(payment_data.get("risk_level", "LOW")).upper()
                allowed_risk, risk_reason = PolicyRules.check_risk_level(risk_level, config.require_human_high_risk)
                if not allowed_risk:
                    return PolicyEvaluationResult(
                        allowed=False,
                        policy_rule="HIGH_RISK_BLOCK",
                        reason=risk_reason,
                        requires_escalation=True,
                        force_action=RecoveryAction.HUMAN_REVIEW.value
                    )

            # 6. Unknown Failure Escalation Check (escalation-class: waived on human sign-off)
            if not human_approved:
                failure_type = str(payment_data.get("failure_type", "UNKNOWN"))
                allowed_type, type_reason = PolicyRules.check_unknown_failure(failure_type, config.escalate_unknown_failure)
                if not allowed_type:
                    return PolicyEvaluationResult(
                        allowed=False,
                        policy_rule="UNKNOWN_FAILURE_ESCALATION",
                        reason=type_reason,
                        requires_escalation=True,
                        force_action=RecoveryAction.HUMAN_REVIEW.value
                    )

            # 7. DPDP Customer Consent Check (for nudges & payment links)
            customer_id = payment_data.get("customer_id", "cust_anonymous")
            allowed_consent, consent_reason = PolicyRules.check_customer_consent(
                recommended_action,
                customer_id,
                customer_context,
                config.require_customer_consent_for_nudge
            )
            if not allowed_consent:
                return PolicyEvaluationResult(
                    allowed=False,
                    policy_rule="CUSTOMER_CONSENT_REQUIRED",
                    reason=consent_reason,
                    requires_escalation=True,
                    force_action=RecoveryAction.HUMAN_REVIEW.value
                )

            # 8. Acquirer Bank Capacity & Circuit Breaker Check (for direct retries)
            if recommended_action == RecoveryAction.RETRY.value:
                method = str(payment_data.get("payment_method", "upi"))
                err = str(payment_data.get("error_code", ""))
                has_capacity, rate_info = PolicyRules.check_acquirer_rate_limits(method, err, dry_run=dry_run)
                if not has_capacity:
                    return PolicyEvaluationResult(
                        allowed=False,
                        policy_rule="ACQUIRER_RATE_LIMIT_PROTECTION",
                        reason=rate_info.get("reason", "Acquirer bank rate-limit saturated. Pausing burst retries."),
                        requires_escalation=False,
                        force_action=RecoveryAction.DELAYED_RETRY.value
                    )

            # All policy checks passed!
            if human_approved:
                return PolicyEvaluationResult(
                    allowed=True,
                    policy_rule="HUMAN_SIGN_OFF_WITHIN_HARD_LIMITS",
                    reason=(
                        f"Action '{recommended_action}' approved by human sign-off; all hard "
                        "policy rules (security, retry quota, consent, acquirer protection) verified."
                    )
                )
            return PolicyEvaluationResult(
                allowed=True,
                policy_rule="POLICY_SATISFIED",
                reason=f"Action '{recommended_action}' fully complies with all active merchant safety policies."
            )

        except Exception as ex:
            # FAIL CLOSED
            return PolicyEvaluationResult(
                allowed=False,
                policy_rule="FAIL_CLOSED_EXCEPTION",
                reason=f"Policy engine encountered an unexpected error: {str(ex)}. Failing closed to protect financial safety.",
                requires_escalation=True,
                force_action=RecoveryAction.STOP.value
            )
