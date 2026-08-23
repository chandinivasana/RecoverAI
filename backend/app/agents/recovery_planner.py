from typing import Dict, Any
from ..models import FailureCategory, RecoveryAction, RiskLevel
from ..core.cost_optimizer import CostOptimizer

class RecoveryPlanner:
    """
    Agent 2: Recovery Planner
    Recommends the optimal bounded recovery strategy, estimates recovery probability,
    and computes expected net monetary recovery.
    """

    @staticmethod
    def plan(analysis_result: Dict[str, Any], payment_data: Dict[str, Any], customer_context: Dict[str, Any]) -> Dict[str, Any]:
        failure_type = analysis_result.get("failure_type", FailureCategory.UNKNOWN.value)
        risk_level = analysis_result.get("risk_level", RiskLevel.LOW.value)
        intel = analysis_result.get("intelligence_signals", {})
        
        amount = float(payment_data.get("amount", 0.0))
        retry_count = int(payment_data.get("retry_count", 0))
        customer_successes = int(customer_context.get("past_successful_payments", 0))
        customer_failures = int(customer_context.get("past_failed_payments", 0))
        propensity = float(intel.get("customer_propensity_score", 0.5))
        gateway_health = float(intel.get("gateway_health_score", 0.85))

        # Default action & probability
        recommended_action = RecoveryAction.STOP.value
        recovery_probability = 0.0
        reason = ""

        # 0. Epistemic Uncertainty Handling (Agent voluntarily abstaining)
        if analysis_result.get("has_epistemic_uncertainty", False):
            recommended_action = RecoveryAction.HUMAN_REVIEW.value
            recovery_probability = 0.40
            reason = analysis_result.get(
                "uncertainty_reason",
                "Epistemic Uncertainty: Conflicting telemetry signals between Acquirer and NPCI switch. Agent voluntarily abstaining."
            )

        # 1. High risk always gets escalated or stopped
        elif failure_type == FailureCategory.HIGH_RISK.value or risk_level in [RiskLevel.HIGH.value, RiskLevel.CRITICAL.value]:
            if amount > 25000:
                recommended_action = RecoveryAction.HUMAN_REVIEW.value
                recovery_probability = 0.35
                reason = f"High-value transaction (₹{amount:,.2f}) with {risk_level} risk profile escalated for manual risk underwriting."
            else:
                recommended_action = RecoveryAction.STOP.value
                recovery_probability = 0.05
                reason = f"High risk transaction flagged; terminating recovery to avoid chargebacks."

        # 2. Temporary Network Failure
        elif failure_type == FailureCategory.TEMPORARY_NETWORK_FAILURE.value:
            if retry_count < 2 and gateway_health >= 0.7:
                recommended_action = RecoveryAction.RETRY.value
                # Probability boosted by Vulcan gateway health & customer track record
                recovery_probability = min(0.95, round(0.70 + (propensity * 0.15) + (gateway_health * 0.10), 2))
                delay = intel.get("suggested_optimal_retry_delay_sec", 15)
                reason = f"Temporary network/gateway timeout with high gateway health ({int(gateway_health*100)}%) and proven customer success record ({customer_successes} successful orders). Automated retry recommended after {delay}s."
            elif retry_count >= 2:
                recommended_action = RecoveryAction.ALTERNATE_METHOD.value
                recovery_probability = 0.65
                reason = f"Network retries exhausted ({retry_count} attempts). Suggesting alternate payment rail to customer."
            else:
                recommended_action = RecoveryAction.DELAYED_RETRY.value
                recovery_probability = 0.60
                reason = f"Transient gateway issue detected. Scheduling delayed retry after bank queue clears."

        # 3. Insufficient Funds
        elif failure_type == FailureCategory.INSUFFICIENT_FUNDS.value:
            if customer_successes >= 3:
                recommended_action = RecoveryAction.DELAYED_RETRY.value
                recovery_probability = 0.55
                reason = f"Insufficient balance for high-tenure customer ({customer_successes} prior orders). Delayed retry scheduled for optimal balance window."
            else:
                recommended_action = RecoveryAction.PAYMENT_LINK.value
                recovery_probability = 0.45
                reason = f"Insufficient balance. Generated dynamic Razorpay payment link with UPI/NetBanking options."

        # 4. Payment Method Failure (Card Expired, Invalid VPA, Pin error)
        elif failure_type == FailureCategory.PAYMENT_METHOD_FAILURE.value:
            recommended_action = RecoveryAction.ALTERNATE_METHOD.value
            recovery_probability = 0.75
            alt = intel.get("recommended_alternate_rail", "NetBanking / UPI")
            reason = f"Payment instrument declined by issuer. Recommending switch to alternate payment rail ({alt})."

        # 5. Checkout Abandonment
        elif failure_type == FailureCategory.CHECKOUT_ABANDONMENT.value:
            if customer_context.get("has_messaging_consent", True):
                recommended_action = RecoveryAction.PAYMENT_LINK.value
                recovery_probability = 0.50
                reason = f"Checkout session abandoned. Sent WhatsApp/SMS recovery nudge with 1-click Razorpay payment link."
            else:
                recommended_action = RecoveryAction.STOP.value
                recovery_probability = 0.10
                reason = f"Checkout abandoned, but customer has opted out of automated recovery messages. Stopping recovery."

        # 6. Unknown / Unclassified
        else:
            recommended_action = RecoveryAction.HUMAN_REVIEW.value
            recovery_probability = 0.20
            reason = f"Ambiguous failure reason '{payment_data.get('failure_reason', '')}'. Escalating to Operations Analyst for root-cause diagnosis."

        # Calculate Expected Net Monetary Recovery: E = P * Amount - Cost
        expected_net_recovery = CostOptimizer.calculate_expected_net_recovery(
            amount=amount,
            recovery_probability=recovery_probability,
            action=recommended_action
        )
        action_cost = CostOptimizer.get_action_cost(recommended_action)

        return {
            "failure_type": failure_type,
            "recommended_action": recommended_action,
            "recovery_probability": recovery_probability,
            "risk_level": risk_level,
            "expected_net_recovery": expected_net_recovery,
            "action_cost": action_cost,
            "reason": reason,
            "requires_human": recommended_action == RecoveryAction.HUMAN_REVIEW.value
        }
