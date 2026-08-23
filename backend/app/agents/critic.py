from typing import Dict, Any
from ..models import RecoveryAction

class RecoveryCritic:
    """
    Agent 3: Recovery Critic (Second Opinion)
    Reviews the planner's recommendation against subtle edge cases, high financial impact,
    and adversarial edge cases before sending to the deterministic policy engine.
    """

    @staticmethod
    def critique(plan_result: Dict[str, Any], payment_data: Dict[str, Any], customer_context: Dict[str, Any]) -> Dict[str, Any]:
        action = plan_result.get("recommended_action")
        amount = float(payment_data.get("amount", 0.0))
        past_failed = int(customer_context.get("past_failed_payments", 0))
        past_successful = int(customer_context.get("past_successful_payments", 0))

        # Check for disagreement scenarios
        if action == RecoveryAction.RETRY.value and amount > 50000:
            return {
                "verdict": "DISAGREE",
                "notes": f"Critic warning: Immediate retry recommended on high ticket transaction ₹{amount:,.2f}. Recommending Human Review or Policy Block instead.",
                "suggested_override": RecoveryAction.HUMAN_REVIEW.value
            }

        if action == RecoveryAction.RETRY.value and past_failed >= 5 and past_successful == 0:
            return {
                "verdict": "DISAGREE",
                "notes": "Critic warning: Customer has 5 consecutive failures with 0 successful payments. Automated retry is unsafe. Propose STOP.",
                "suggested_override": RecoveryAction.STOP.value
            }

        return {
            "verdict": "AGREE",
            "notes": "Critic confirms recovery recommendation aligns with risk boundaries and context.",
            "suggested_override": None
        }
