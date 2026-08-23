import uuid
import json
from datetime import datetime
from typing import Dict, Any
from sqlalchemy.orm import Session
from ..models import (
    DBPayment, DBRecoveryExecution, DBHumanReview,
    RecoveryAction, PaymentStatus, ReviewStatus, FailureCategory
)
from ..core.audit import append_audit
from ..core.outcome_model import assign_ground_truth, simulate_action_outcome
from ..core.rate_limiter import AcquirerRateLimitManager
from ..policy.rules import PolicyEvaluationResult

class RecoveryExecutor:
    """
    Agent 4: Recovery Executor
    Executes ONLY policy-approved recovery actions within simulated or production payment rails.
    Never executes if policy engine rejected the action.
    """

    @staticmethod
    def _register_acquirer_failure(db: Session, payment: DBPayment) -> Dict[str, Any]:
        """Feeds failed retries into the acquirer error window; trips the circuit
        breaker at the threshold and records an audit event when it opens."""
        breaker = AcquirerRateLimitManager.register_acquirer_failure(
            payment.payment_method, payment.error_code or ""
        )
        if breaker["circuit_breaker_tripped"]:
            append_audit(db, payment.payment_id, "CIRCUIT_BREAKER_TRIPPED",
                         "AcquirerRateLimitManager", breaker)
        return breaker

    @staticmethod
    def execute(
        db: Session,
        payment: DBPayment,
        action: str,
        policy_result: PolicyEvaluationResult,
        decision_data: Dict[str, Any],
        actor: str = "RecoverAI-Executor"
    ) -> Dict[str, Any]:
        execution_id = f"exec_{uuid.uuid4().hex[:10]}"
        amount = payment.amount
        prob = decision_data.get("recovery_probability", 0.5)

        # 1. Check Policy Authorization
        if not policy_result.allowed:
            # Action was blocked by policy engine
            if policy_result.requires_escalation or policy_result.force_action == RecoveryAction.HUMAN_REVIEW.value:
                # Create Human Review Escalation Task
                review_id = f"rev_{uuid.uuid4().hex[:8]}"
                review = DBHumanReview(
                    review_id=review_id,
                    payment_id=payment.payment_id,
                    decision_id=decision_data.get("decision_id", "dec_manual"),
                    amount=amount,
                    reason=policy_result.reason,
                    risk_level=decision_data.get("risk_level", "HIGH"),
                    status=ReviewStatus.PENDING.value,
                    proposed_action=action,
                    created_at=datetime.utcnow()
                )
                db.add(review)
                payment.status = PaymentStatus.ESCALATED_TO_HUMAN.value

                # Execution record for blocked & escalated action
                exec_record = DBRecoveryExecution(
                    execution_id=execution_id,
                    payment_id=payment.payment_id,
                    action=action,
                    status="ESCALATED",
                    result=f"Blocked by policy '{policy_result.policy_rule}'. Escalated to Human Review Queue.",
                    amount_recovered=0.0,
                    details_json=json.dumps({"review_id": review_id, "policy_rule": policy_result.policy_rule, "reason": policy_result.reason}),
                    executed_at=datetime.utcnow()
                )
                db.add(exec_record)

                # Audit Event
                append_audit(db, payment.payment_id, "RECOVERY_BLOCKED_AND_ESCALATED", "PolicyEngine", {
                    "rule": policy_result.policy_rule,
                    "reason": policy_result.reason,
                    "review_id": review_id
                })
                db.commit()

                return {
                    "execution_id": execution_id,
                    "action": action,
                    "status": "ESCALATED",
                    "result": f"Blocked by policy ({policy_result.policy_rule}). Escalated to Human Review.",
                    "amount_recovered": 0.0,
                    "details": {"review_id": review_id, "escalated": True}
                }
            else:
                # Policy says STOP
                payment.status = PaymentStatus.STOPPED.value
                exec_record = DBRecoveryExecution(
                    execution_id=execution_id,
                    payment_id=payment.payment_id,
                    action=RecoveryAction.STOP.value,
                    status="STOPPED",
                    result=f"Recovery halted by policy rule '{policy_result.policy_rule}': {policy_result.reason}",
                    amount_recovered=0.0,
                    details_json=json.dumps({"policy_rule": policy_result.policy_rule, "stopped": True}),
                    executed_at=datetime.utcnow()
                )
                db.add(exec_record)
                append_audit(db, payment.payment_id, "RECOVERY_STOPPED_BY_POLICY", "PolicyEngine", {
                    "rule": policy_result.policy_rule,
                    "reason": policy_result.reason
                })
                db.commit()

                return {
                    "execution_id": execution_id,
                    "action": RecoveryAction.STOP.value,
                    "status": "STOPPED",
                    "result": f"Recovery stopped by policy ({policy_result.policy_rule}).",
                    "amount_recovered": 0.0,
                    "details": {"stopped": True}
                }

        # 2. Policy APPROVED: Execute Authorized Action
        if action == RecoveryAction.STOP.value:
            payment.status = PaymentStatus.STOPPED.value
            exec_record = DBRecoveryExecution(
                execution_id=execution_id,
                payment_id=payment.payment_id,
                action=action,
                status="STOPPED",
                result="Autonomous recovery intentionally halted per planner decision.",
                amount_recovered=0.0,
                details_json=json.dumps({"action": "STOP"}),
                executed_at=datetime.utcnow()
            )
            db.add(exec_record)
            append_audit(db, payment.payment_id, "RECOVERY_SAFE_STOP", actor, {
                "reason": decision_data.get("reason", "")
            })
            db.commit()
            return {
                "execution_id": execution_id,
                "action": action,
                "status": "STOPPED",
                "result": "Safe stop executed.",
                "amount_recovered": 0.0,
                "details": {}
            }

        if action == RecoveryAction.HUMAN_REVIEW.value:
            # Approved escalation: hand off to the review queue. An escalation
            # never settles money itself, so it records no recovered amount.
            review_id = f"rev_{uuid.uuid4().hex[:8]}"
            review = DBHumanReview(
                review_id=review_id,
                payment_id=payment.payment_id,
                decision_id=decision_data.get("decision_id", "dec_manual"),
                amount=amount,
                reason=decision_data.get("reason", "Escalated for human oversight"),
                risk_level=decision_data.get("risk_level", "HIGH"),
                status=ReviewStatus.PENDING.value,
                proposed_action=action,
                created_at=datetime.utcnow()
            )
            db.add(review)
            payment.status = PaymentStatus.ESCALATED_TO_HUMAN.value
            result_text = "Transaction enqueued to Operations Review Dashboard."
            details = {"review_id": review_id, "queue": "Tier-1 Payment Ops"}
            exec_record = DBRecoveryExecution(
                execution_id=execution_id,
                payment_id=payment.payment_id,
                action=action,
                status="ESCALATED",
                result=result_text,
                amount_recovered=0.0,
                details_json=json.dumps(details),
                executed_at=datetime.utcnow()
            )
            db.add(exec_record)
            append_audit(db, payment.payment_id, "EXECUTION_HUMAN_REVIEW_ESCALATED", actor, {
                "review_id": review_id,
                "reason": decision_data.get("reason", "")
            })
            db.commit()
            return {
                "execution_id": execution_id,
                "action": action,
                "status": "ESCALATED",
                "result": result_text,
                "amount_recovered": 0.0,
                "details": details
            }

        # Simulated execution of the approved monetary action.
        # The outcome comes from the seeded ground-truth model
        # (core/outcome_model.py) — NEVER from thresholding the planner's own
        # prediction. `prob` is the planner's forecast, recorded for
        # calibration measurement only.
        failure_category = decision_data.get("failure_type", FailureCategory.UNKNOWN.value)
        if payment.ground_truth_recoverable is None:
            meta = json.loads(payment.metadata_json or "{}")
            gt_recoverable, gt_prob, outcome_seed = assign_ground_truth(
                payment.payment_id, failure_category, amount, meta
            )
            payment.ground_truth_recoverable = gt_recoverable
            payment.ground_truth_prob = gt_prob
            payment.outcome_seed = outcome_seed
        is_success = simulate_action_outcome(
            payment.ground_truth_recoverable, payment.outcome_seed, action, failure_category
        )
        amount_rec = amount if is_success else 0.0

        details = {}
        if action == RecoveryAction.RETRY.value:
            payment.retry_count += 1
            if is_success:
                payment.status = PaymentStatus.RECOVERED.value
                payment.amount_recovered = amount_rec
                result_text = f"Automated retry succeeded! Recovered ₹{amount:,.2f} via {payment.payment_method.upper()} rails."
                details = {
                    "gateway_txn_id": f"gtxn_{uuid.uuid4().hex[:12]}",
                    "settled": True,
                    "retry_attempt": payment.retry_count
                }
            else:
                payment.status = PaymentStatus.FAILED.value
                result_text = f"Automated retry attempt {payment.retry_count} failed."
                details = {"retry_attempt": payment.retry_count, "settled": False}
                details["acquirer_failure_tracking"] = RecoveryExecutor._register_acquirer_failure(db, payment)

        elif action == RecoveryAction.DELAYED_RETRY.value:
            payment.retry_count += 1
            if is_success:
                payment.status = PaymentStatus.RECOVERED.value
                payment.amount_recovered = amount_rec
                result_text = f"Delayed retry executed after optimal balance replenishment window. Recovered ₹{amount:,.2f}."
                details = {"delay_seconds": 15, "settled": True}
            else:
                payment.status = PaymentStatus.FAILED.value
                result_text = "Delayed retry attempt failed."
                details = {"settled": False}
                details["acquirer_failure_tracking"] = RecoveryExecutor._register_acquirer_failure(db, payment)

        elif action == RecoveryAction.ALTERNATE_METHOD.value:
            if is_success:
                payment.status = PaymentStatus.RECOVERED.value
                payment.amount_recovered = amount_rec
                alt_rail = "UPI QR" if payment.payment_method != "upi" else "NetBanking (HDFC/ICICI)"
                result_text = f"Customer switched payment method to {alt_rail}. Recovered ₹{amount:,.2f}."
                details = {"alternate_method": alt_rail, "settled": True}
            else:
                payment.status = PaymentStatus.FAILED.value
                result_text = "Customer did not complete checkout on alternate rail."
                details = {"settled": False}

        elif action == RecoveryAction.PAYMENT_LINK.value:
            link_url = f"https://rzp.io/i/{uuid.uuid4().hex[:8]}"
            if is_success:
                payment.status = PaymentStatus.RECOVERED.value
                payment.amount_recovered = amount_rec
                result_text = f"Recovery Payment Link created ({link_url}) and settled by customer. Recovered ₹{amount:,.2f}."
                details = {
                    "payment_link_url": link_url,
                    "nudge_channel": "WhatsApp / SMS",
                    "nudge_text": f"Hi {payment.customer_name}, complete your pending payment of ₹{amount:,.2f} securely: {link_url}",
                    "settled": True
                }
            else:
                payment.status = PaymentStatus.PERMANENTLY_FAILED.value
                result_text = f"Recovery Payment Link created ({link_url}) but expired."
                details = {"payment_link_url": link_url, "settled": False}

        # Planner forecast recorded alongside the outcome for calibration audits.
        details["predicted_probability"] = prob

        # Record Execution
        exec_record = DBRecoveryExecution(
            execution_id=execution_id,
            payment_id=payment.payment_id,
            action=action,
            status="SUCCESS" if is_success else "FAILED",
            result=result_text,
            amount_recovered=amount_rec,
            details_json=json.dumps(details),
            executed_at=datetime.utcnow()
        )
        db.add(exec_record)

        # Record Audit Event
        append_audit(db, payment.payment_id, f"EXECUTION_{action}_{exec_record.status}", actor, {
            "result": result_text,
            "amount_recovered": amount_rec,
            "details": details
        })

        db.commit()

        return {
            "execution_id": execution_id,
            "action": action,
            "status": exec_record.status,
            "result": result_text,
            "amount_recovered": amount_rec,
            "details": details
        }
