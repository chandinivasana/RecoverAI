import json
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import (
    DBPayment, DBRecoveryDecision, DBPolicyDecision, DBPolicyConfig,
    PaymentStatus, RecoveryAction
)
from ..core.audit import append_audit
from ..core.config_store import get_active_policy_config
from ..core.llm_reasoner import get_reasoner
from ..agents.payment_analyst import PaymentAnalyst
from ..agents.recovery_planner import RecoveryPlanner
from ..agents.critic import RecoveryCritic
from ..agents.recovery_executor import RecoveryExecutor
from ..policy.engine import PolicyEngine

router = APIRouter(prefix="/api/recovery", tags=["Recovery"])

# The Critic can only tighten a plan, never widen it: overrides are limited to
# routing the decision to a human or stopping outright (de-escalation-only).
CRITIC_ALLOWED_OVERRIDES = (RecoveryAction.HUMAN_REVIEW.value, RecoveryAction.STOP.value)


def _apply_critic_override(db: Session, payment_id: str, plan: Dict[str, Any], critic: Dict[str, Any]) -> bool:
    """If the Critic disagrees and proposes a de-escalation, the pipeline adopts
    it BEFORE policy evaluation and records an audit event. Returns True if applied."""
    if critic.get("verdict") != "DISAGREE":
        return False
    override = critic.get("suggested_override")
    if override not in CRITIC_ALLOWED_OVERRIDES:
        return False
    original_action = plan["recommended_action"]
    if original_action == override:
        return False
    plan["recommended_action"] = override
    plan["requires_human"] = override == RecoveryAction.HUMAN_REVIEW.value
    plan["reason"] = f"{plan['reason']} [Critic override applied: {critic.get('notes', '')}]"
    append_audit(db, payment_id, "CRITIC_OVERRIDE_APPLIED", "RecoveryCritic", {
        "original_action": original_action,
        "override_action": override,
        "notes": critic.get("notes", "")
    })
    return True


def _audit_llm_degradation(db: Session, payment_id: str, source: str, result: Dict[str, Any]) -> None:
    """When an LLM-backed result fell back to deterministic reasoning, record it —
    the graceful-failure path is itself an auditable event."""
    info = result.get("llm", result)
    if info.get("degraded"):
        append_audit(db, payment_id, "LLM_FALLBACK", "LLMReasoner", {
            "source": source,
            "provider": info.get("provider"),
            "error": info.get("fallback_error", "")
        })


def _attach_llm_enrichment(db: Session, payment_id: str, analysis: Dict[str, Any],
                           pay_data: Dict[str, Any], cust_ctx: Dict[str, Any]) -> None:
    """LLM narrative enrichment of the analyst output. Advisory only: it never
    mutates the deterministic classification or risk level."""
    reasoner = get_reasoner()
    if reasoner.name != "anthropic":
        return
    enrichment = reasoner.explain_analysis(analysis, pay_data, cust_ctx)
    analysis["llm_enrichment"] = enrichment
    _audit_llm_degradation(db, payment_id, "analyst_enrichment", enrichment)

@router.post("/{payment_id}/analyze")
def analyze_payment(payment_id: str, db: Session = Depends(get_db)):
    """
    Step 1: Payment Analyst analyzes failure reasons and gathers intelligence.
    """
    payment = db.query(DBPayment).filter(DBPayment.payment_id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    config = get_active_policy_config(db)
    cust_ctx = json.loads(payment.metadata_json or "{}")
    pay_data = {
        "payment_id": payment.payment_id,
        "amount": payment.amount,
        "payment_method": payment.payment_method,
        "failure_reason": payment.failure_reason,
        "error_code": payment.error_code,
        "retry_count": payment.retry_count
    }

    analysis = PaymentAnalyst.analyze(pay_data, cust_ctx, vulcan_enabled=config.vulcan_enabled)
    _attach_llm_enrichment(db, payment.payment_id, analysis, pay_data, cust_ctx)

    # Record Audit Event
    append_audit(db, payment.payment_id, "FAILURE_CLASSIFIED", "PaymentAnalyst", analysis)
    db.commit()

    return analysis

@router.post("/{payment_id}/plan")
def plan_recovery(payment_id: str, db: Session = Depends(get_db)):
    """
    Step 2: Recovery Planner recommends a bounded action & calculates expected recovery.
    """
    payment = db.query(DBPayment).filter(DBPayment.payment_id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    config = get_active_policy_config(db)
    cust_ctx = json.loads(payment.metadata_json or "{}")
    pay_data = {
        "payment_id": payment.payment_id,
        "amount": payment.amount,
        "payment_method": payment.payment_method,
        "failure_reason": payment.failure_reason,
        "error_code": payment.error_code,
        "retry_count": payment.retry_count
    }

    analysis = PaymentAnalyst.analyze(pay_data, cust_ctx, vulcan_enabled=config.vulcan_enabled)
    _attach_llm_enrichment(db, payment.payment_id, analysis, pay_data, cust_ctx)
    plan_result = RecoveryPlanner.plan(analysis, pay_data, cust_ctx)
    critic_result = RecoveryCritic.critique(plan_result, pay_data, cust_ctx)
    _audit_llm_degradation(db, payment.payment_id, "critic", critic_result)
    critic_override_applied = _apply_critic_override(db, payment.payment_id, plan_result, critic_result)

    # Persist Recovery Decision
    decision_id = f"dec_{uuid.uuid4().hex[:10]}"
    rec_decision = DBRecoveryDecision(
        decision_id=decision_id,
        payment_id=payment.payment_id,
        failure_type=analysis["failure_type"],
        recommended_action=plan_result["recommended_action"],
        recovery_probability=plan_result["recovery_probability"],
        risk_level=analysis["risk_level"],
        expected_net_recovery=plan_result["expected_net_recovery"],
        action_cost=plan_result["action_cost"],
        reason=plan_result["reason"],
        signals_json=json.dumps(analysis.get("intelligence_signals", {})),
        critic_verdict=critic_result["verdict"],
        critic_notes=critic_result["notes"],
        created_at=datetime.utcnow()
    )
    db.add(rec_decision)

    # Record Audit Event
    append_audit(db, payment.payment_id, "RECOVERY_PLAN_GENERATED", "RecoveryPlanner", {
        "action": plan_result["recommended_action"],
        "prob": plan_result["recovery_probability"],
        "reason": plan_result["reason"]
    })
    db.commit()

    return {
        "decision_id": decision_id,
        "analysis": analysis,
        "plan": plan_result,
        "critic": critic_result,
        "critic_override_applied": critic_override_applied
    }

@router.post("/{payment_id}/process")
def process_full_recovery_pipeline(payment_id: str, db: Session = Depends(get_db)):
    """
    Complete Agentic Lifecycle:
    Ingestion Context -> Payment Analyst -> Recovery Planner -> Critic -> Policy Engine -> Execution -> Audit Log.
    """
    payment = db.query(DBPayment).filter(DBPayment.payment_id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    config = get_active_policy_config(db)
    cust_ctx = json.loads(payment.metadata_json or "{}")
    pay_data = {
        "payment_id": payment.payment_id,
        "amount": payment.amount,
        "payment_method": payment.payment_method,
        "failure_reason": payment.failure_reason,
        "error_code": payment.error_code,
        "retry_count": payment.retry_count
    }

    # 1. Analyst
    analysis = PaymentAnalyst.analyze(pay_data, cust_ctx, vulcan_enabled=config.vulcan_enabled)
    pay_data["failure_type"] = analysis["failure_type"]
    pay_data["risk_level"] = analysis["risk_level"]
    _attach_llm_enrichment(db, payment.payment_id, analysis, pay_data, cust_ctx)

    # 2. Planner
    plan = RecoveryPlanner.plan(analysis, pay_data, cust_ctx)

    # 3. Critic (Second Opinion) — a DISAGREE with a de-escalation override is
    # adopted before policy evaluation ("two passes must agree before autonomy").
    # When the LLM is enabled the critique is a strengthen-only merge of the
    # deterministic rules and the LLM's independent review (see agents/critic.py).
    critic = RecoveryCritic.critique(plan, pay_data, cust_ctx)
    _audit_llm_degradation(db, payment.payment_id, "critic", critic)
    critic_override_applied = _apply_critic_override(db, payment.payment_id, plan, critic)

    # 4. Record Decision
    decision_id = f"dec_{uuid.uuid4().hex[:10]}"
    rec_decision = DBRecoveryDecision(
        decision_id=decision_id,
        payment_id=payment.payment_id,
        failure_type=analysis["failure_type"],
        recommended_action=plan["recommended_action"],
        recovery_probability=plan["recovery_probability"],
        risk_level=analysis["risk_level"],
        expected_net_recovery=plan["expected_net_recovery"],
        action_cost=plan["action_cost"],
        reason=plan["reason"],
        signals_json=json.dumps(analysis.get("intelligence_signals", {})),
        critic_verdict=critic["verdict"],
        critic_notes=critic["notes"],
        created_at=datetime.utcnow()
    )
    db.add(rec_decision)

    # 5. Deterministic Policy Engine (Fail-Closed)
    policy_res = PolicyEngine.evaluate(
        recommended_action=plan["recommended_action"],
        payment_data=pay_data,
        customer_context=cust_ctx,
        config=config
    )

    pol_id = f"pol_{uuid.uuid4().hex[:10]}"
    pol_decision = DBPolicyDecision(
        policy_decision_id=pol_id,
        decision_id=decision_id,
        payment_id=payment.payment_id,
        action=plan["recommended_action"],
        allowed=policy_res.allowed,
        policy_rule=policy_res.policy_rule,
        reason=policy_res.reason,
        created_at=datetime.utcnow()
    )
    db.add(pol_decision)

    # Audit Policy Event
    append_audit(db, payment.payment_id, "POLICY_EVALUATION", "PolicyEngine", {
        "allowed": policy_res.allowed,
        "rule": policy_res.policy_rule,
        "reason": policy_res.reason
    })
    db.commit()

    # 6. Recovery Executor
    exec_result = RecoveryExecutor.execute(
        db=db,
        payment=payment,
        action=plan["recommended_action"],
        policy_result=policy_res,
        decision_data={
            "decision_id": decision_id,
            "recovery_probability": plan["recovery_probability"],
            "risk_level": analysis["risk_level"],
            "failure_type": analysis["failure_type"],
            "reason": plan["reason"]
        }
    )

    return {
        "payment_id": payment.payment_id,
        "status": payment.status,
        "analysis": analysis,
        "decision": {
            "decision_id": decision_id,
            "action": plan["recommended_action"],
            "probability": plan["recovery_probability"],
            "expected_net_recovery": plan["expected_net_recovery"],
            "action_cost": plan["action_cost"],
            "reason": plan["reason"],
            "critic": critic,
            "critic_override_applied": critic_override_applied
        },
        "policy": {
            "policy_decision_id": pol_id,
            "allowed": policy_res.allowed,
            "policy_rule": policy_res.policy_rule,
            "reason": policy_res.reason
        },
        "execution": exec_result
    }

@router.post("/batch-process")
def batch_process_recoveries(
    limit: int = Query(25, ge=1, le=100),
    dataset_split: Optional[str] = "dev",
    db: Session = Depends(get_db)
):
    """
    Batch process up to N pending failed payments through the full agentic pipeline.
    """
    payments = db.query(DBPayment).filter(
        DBPayment.status == PaymentStatus.FAILED.value,
        DBPayment.dataset_split == dataset_split
    ).limit(limit).all()

    results = []
    for p in payments:
        res = process_full_recovery_pipeline(p.payment_id, db)
        results.append({
            "payment_id": p.payment_id,
            "amount": p.amount,
            "status": res["status"],
            "action": res["decision"]["action"],
            "allowed": res["policy"]["allowed"],
            "amount_recovered": res["execution"]["amount_recovered"]
        })

    return {
        "processed_count": len(results),
        "total_recovered_amount": sum(r["amount_recovered"] for r in results),
        "results": results
    }
