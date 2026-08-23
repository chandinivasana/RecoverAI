from typing import Any

from ..core.llm_reasoner import get_reasoner
from ..models import RecoveryAction


class RecoveryCritic:
    """
    Agent 3: Recovery Critic (Second Opinion)
    Reviews the planner's recommendation before it reaches the deterministic
    policy engine. Two passes compose here:

    1. Deterministic rules — always run, never skipped.
    2. LLM critique (when LLM_ENABLED) — merged STRENGTHEN-ONLY:
       - Either pass saying DISAGREE makes the final verdict DISAGREE.
       - The LLM can never flip a deterministic DISAGREE back to AGREE.
       - LLM overrides are schema-limited to HUMAN_REVIEW/STOP (de-escalation);
         anything else fails validation and falls back to the deterministic result.

    The critic advises only — the PolicyEngine remains the sole execution gate.
    """

    @staticmethod
    def _deterministic_rules(plan_result: dict[str, Any], payment_data: dict[str, Any],
                             customer_context: dict[str, Any]) -> dict[str, Any]:
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

    @staticmethod
    def critique(plan_result: dict[str, Any], payment_data: dict[str, Any],
                 customer_context: dict[str, Any]) -> dict[str, Any]:
        deterministic = RecoveryCritic._deterministic_rules(plan_result, payment_data, customer_context)

        reasoner = get_reasoner()
        if reasoner.name != "anthropic":
            # LLM disabled: identical behavior to the pure rule-based critic.
            return {**deterministic, "llm": {"enabled": False, "provider": reasoner.name}}

        llm = reasoner.critique_plan(plan_result, payment_data, customer_context, deterministic)
        final = dict(deterministic)
        llm_meta: dict[str, Any] = {
            "enabled": True,
            "provider": llm.get("provider"),
            "degraded": llm.get("degraded", False),
            "latency_ms": llm.get("latency_ms", 0),
            "verdict": llm.get("verdict"),
        }
        if llm.get("fallback_error"):
            llm_meta["fallback_error"] = llm["fallback_error"]

        if not llm.get("degraded"):
            if deterministic["verdict"] == "AGREE" and llm.get("verdict") == "DISAGREE":
                # Strengthen: adopt the LLM's disagreement, normalized to a
                # de-escalation. (Schema already limits it, this is belt+braces.)
                override = llm.get("suggested_override")
                if override not in (RecoveryAction.HUMAN_REVIEW.value, RecoveryAction.STOP.value):
                    override = RecoveryAction.HUMAN_REVIEW.value
                final["verdict"] = "DISAGREE"
                final["suggested_override"] = override
                final["notes"] = f"LLM critic disagreement: {llm.get('notes', '')}"
            elif deterministic["verdict"] == "DISAGREE" and llm.get("notes"):
                # Deterministic disagreement always stands; LLM may only annotate.
                final["notes"] = f"{deterministic['notes']} [LLM second opinion: {llm['notes']}]"

        final["llm"] = llm_meta
        return final
