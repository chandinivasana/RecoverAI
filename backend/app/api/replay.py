import json
from typing import Dict, Any, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import DBPayment, DBPolicyConfig
from ..agents.payment_analyst import PaymentAnalyst
from ..agents.recovery_planner import RecoveryPlanner
from ..agents.critic import RecoveryCritic
from ..policy.engine import PolicyEngine

router = APIRouter(prefix="/api/replay", tags=["Time-Travel Replay"])

class ReplayRequest(BaseModel):
    payment_id: Optional[str] = None
    override_amount: Optional[float] = None
    override_failure_reason: Optional[str] = None
    override_error_code: Optional[str] = None
    override_payment_method: Optional[str] = None
    override_retry_count: Optional[int] = None
    override_risk_score: Optional[float] = None
    override_messaging_consent: Optional[bool] = None

@router.post("")
def run_time_travel_replay(req: ReplayRequest, db: Session = Depends(get_db)):
    """
    Section 35: Time-Travel Replay.
    Allows replaying any transaction through the decision pipeline and tweaking inputs
    to compare how policy decisions and actions shift in real time.
    """
    config = db.query(DBPolicyConfig).first()
    if not config:
        config = DBPolicyConfig()

    # Base payment
    payment = None
    if req.payment_id:
        payment = db.query(DBPayment).filter(DBPayment.payment_id == req.payment_id).first()

    base_amount = payment.amount if payment else 4500.0
    base_method = payment.payment_method if payment else "upi"
    base_reason = payment.failure_reason if payment else "Bank network timeout during UPI PIN entry"
    base_error = payment.error_code if payment else "GATEWAY_TIMEOUT"
    base_retries = payment.retry_count if payment else 0
    base_meta = json.loads(payment.metadata_json or "{}") if payment else {
        "customer_name": "Rahul Sharma",
        "tenure_months": 12,
        "past_successful_payments": 10,
        "past_failed_payments": 1,
        "risk_score": 0.10,
        "has_messaging_consent": True
    }

    # 1. Run Original Pipeline Trace
    orig_pay_data = {
        "payment_id": payment.payment_id if payment else "TXN_ORIGINAL",
        "amount": base_amount,
        "payment_method": base_method,
        "failure_reason": base_reason,
        "error_code": base_error,
        "retry_count": base_retries
    }
    orig_analysis = PaymentAnalyst.analyze(orig_pay_data, base_meta, vulcan_enabled=config.vulcan_enabled)
    orig_pay_data["failure_type"] = orig_analysis["failure_type"]
    orig_pay_data["risk_level"] = orig_analysis["risk_level"]
    orig_plan = RecoveryPlanner.plan(orig_analysis, orig_pay_data, base_meta)
    orig_critic = RecoveryCritic.critique(orig_plan, orig_pay_data, base_meta)
    orig_policy = PolicyEngine.evaluate(orig_plan["recommended_action"], orig_pay_data, base_meta, config, dry_run=True)

    # 2. Run Replay / Modified Pipeline Trace
    mod_amount = req.override_amount if req.override_amount is not None else base_amount
    mod_method = req.override_payment_method if req.override_payment_method is not None else base_method
    mod_reason = req.override_failure_reason if req.override_failure_reason is not None else base_reason
    mod_error = req.override_error_code if req.override_error_code is not None else base_error
    mod_retries = req.override_retry_count if req.override_retry_count is not None else base_retries
    
    mod_meta = dict(base_meta)
    if req.override_risk_score is not None:
        mod_meta["risk_score"] = req.override_risk_score
    if req.override_messaging_consent is not None:
        mod_meta["has_messaging_consent"] = req.override_messaging_consent

    mod_pay_data = {
        "payment_id": f"REPLAY_{payment.payment_id if payment else 'CUSTOM'}",
        "amount": mod_amount,
        "payment_method": mod_method,
        "failure_reason": mod_reason,
        "error_code": mod_error,
        "retry_count": mod_retries
    }
    mod_analysis = PaymentAnalyst.analyze(mod_pay_data, mod_meta, vulcan_enabled=config.vulcan_enabled)
    mod_pay_data["failure_type"] = mod_analysis["failure_type"]
    mod_pay_data["risk_level"] = mod_analysis["risk_level"]
    mod_plan = RecoveryPlanner.plan(mod_analysis, mod_pay_data, mod_meta)
    mod_critic = RecoveryCritic.critique(mod_plan, mod_pay_data, mod_meta)
    mod_policy = PolicyEngine.evaluate(mod_plan["recommended_action"], mod_pay_data, mod_meta, config, dry_run=True)

    return {
        "original_trace": {
            "inputs": {
                "amount": base_amount,
                "payment_method": base_method,
                "failure_reason": base_reason,
                "error_code": base_error,
                "retry_count": base_retries
            },
            "stage_1_analysis": orig_analysis,
            "stage_2_planner": orig_plan,
            "stage_3_critic": orig_critic,
            "stage_4_policy": {
                "allowed": orig_policy.allowed,
                "rule": orig_policy.policy_rule,
                "reason": orig_policy.reason,
                "requires_escalation": orig_policy.requires_escalation
            },
            "final_outcome": "EXECUTE" if orig_policy.allowed else ("ESCALATE" if orig_policy.requires_escalation else "STOP")
        },
        "replayed_trace": {
            "inputs": {
                "amount": mod_amount,
                "payment_method": mod_method,
                "failure_reason": mod_reason,
                "error_code": mod_error,
                "retry_count": mod_retries
            },
            "stage_1_analysis": mod_analysis,
            "stage_2_planner": mod_plan,
            "stage_3_critic": mod_critic,
            "stage_4_policy": {
                "allowed": mod_policy.allowed,
                "rule": mod_policy.policy_rule,
                "reason": mod_policy.reason,
                "requires_escalation": mod_policy.requires_escalation
            },
            "final_outcome": "EXECUTE" if mod_policy.allowed else ("ESCALATE" if mod_policy.requires_escalation else "STOP")
        },
        "delta_summary": {
            "amount_diff": mod_amount - base_amount,
            "action_changed": orig_plan["recommended_action"] != mod_plan["recommended_action"],
            "policy_outcome_changed": orig_policy.allowed != mod_policy.allowed,
            "explanation": f"When amount is changed from ₹{base_amount:,.2f} to ₹{mod_amount:,.2f}, decision shifts from {orig_policy.policy_rule} ({'ALLOWED' if orig_policy.allowed else 'BLOCKED'}) to {mod_policy.policy_rule} ({'ALLOWED' if mod_policy.allowed else 'BLOCKED'})."
        }
    }
