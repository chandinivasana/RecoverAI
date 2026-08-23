import json
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
import ast
from ..models import (
    DBHumanReview, DBPayment, DBRecoveryDecision,
    DBPolicyConfig, ReviewStatus, PaymentStatus, HumanReviewActionRequest, RecoveryAction
)
from ..agents.payment_analyst import PaymentAnalyst
from ..agents.recovery_executor import RecoveryExecutor
from ..core.audit import append_audit
from ..policy.engine import PolicyEngine

router = APIRouter(prefix="/api/reviews", tags=["Human Review"])

VALID_ACTIONS = {a.value for a in RecoveryAction}
EXECUTABLE_ACTIONS = VALID_ACTIONS - {RecoveryAction.HUMAN_REVIEW.value}

def safe_json_loads(val):
    if not val:
        return {}
    if isinstance(val, dict):
        return val
    try:
        return json.loads(val)
    except Exception:
        try:
            return ast.literal_eval(val)
        except Exception:
            return {"raw": str(val)}

@router.get("")
def list_human_reviews(
    status: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    List transactions requiring human operator oversight/approval.
    """
    query = db.query(DBHumanReview)
    if status:
        query = query.filter(DBHumanReview.status == status)

    total = query.count()
    reviews = query.order_by(DBHumanReview.created_at.desc()).offset(offset).limit(limit).all()

    items = []
    for r in reviews:
        payment = db.query(DBPayment).filter(DBPayment.payment_id == r.payment_id).first()
        meta = safe_json_loads(payment.metadata_json) if payment else {}
        items.append({
            "review_id": r.review_id,
            "payment_id": r.payment_id,
            "decision_id": r.decision_id,
            "amount": r.amount,
            "reason": r.reason,
            "risk_level": r.risk_level,
            "status": r.status,
            "reviewer": r.reviewer,
            "review_notes": r.review_notes,
            "proposed_action": r.proposed_action,
            "customer_name": payment.customer_name if payment else "Unknown",
            "payment_method": payment.payment_method if payment else "upi",
            "failure_reason": payment.failure_reason if payment else "",
            "customer_context": meta,
            "created_at": r.created_at,
            "resolved_at": r.resolved_at
        })

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "reviews": items
    }

@router.post("/{review_id}/approve")
def approve_review(review_id: str, req: HumanReviewActionRequest, db: Session = Depends(get_db)):
    """
    Human Administrator approves the payment recovery action.

    Approval is NOT a policy bypass: the action is re-validated through the
    deterministic PolicyEngine with human_approved=True, which waives only the
    escalation-class rules (amount cap, high risk, unknown failure — the rules
    whose remedy IS a human). Hard rules — injection defense, retry quota,
    DPDP consent, acquirer circuit breaker — still block. Even humans cannot
    override them.
    """
    review = db.query(DBHumanReview).filter(DBHumanReview.review_id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review task not found")
    if review.status != ReviewStatus.PENDING.value:
        raise HTTPException(status_code=400, detail=f"Review is already {review.status}")

    payment = db.query(DBPayment).filter(DBPayment.payment_id == review.payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Associated payment not found")

    # Bounded-action validation: only known actions, and only executable ones.
    if req.override_action and req.override_action not in VALID_ACTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"override_action must be one of {sorted(VALID_ACTIONS)}"
        )
    action_to_run = req.override_action or review.proposed_action or RecoveryAction.RETRY.value
    if action_to_run not in EXECUTABLE_ACTIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                "The proposed action is HUMAN_REVIEW, which is an escalation rather than an "
                f"executable recovery. Pass override_action with one of {sorted(EXECUTABLE_ACTIONS)}."
            )
        )

    # Re-run deterministic analysis so the policy engine sees fresh facts,
    # then re-validate through the engine with human sign-off semantics.
    config = db.query(DBPolicyConfig).first() or DBPolicyConfig()
    cust_ctx = safe_json_loads(payment.metadata_json)
    pay_data = {
        "payment_id": payment.payment_id,
        "amount": payment.amount,
        "payment_method": payment.payment_method,
        "failure_reason": payment.failure_reason,
        "error_code": payment.error_code,
        "retry_count": payment.retry_count
    }
    analysis = PaymentAnalyst.analyze(pay_data, cust_ctx, vulcan_enabled=config.vulcan_enabled)
    pay_data["failure_type"] = analysis["failure_type"]
    pay_data["risk_level"] = analysis["risk_level"]

    policy_res = PolicyEngine.evaluate(action_to_run, pay_data, cust_ctx, config, human_approved=True)

    if not policy_res.allowed:
        # Hard policy rule blocks the approval — record it and refuse. The
        # review stays PENDING so the reviewer can choose a compliant action.
        append_audit(db, payment.payment_id, "HUMAN_APPROVAL_BLOCKED_BY_HARD_RULE",
                     f"HumanReviewer:{req.reviewer}", {
                         "review_id": review_id,
                         "attempted_action": action_to_run,
                         "policy_rule": policy_res.policy_rule,
                         "reason": policy_res.reason
                     })
        db.commit()
        raise HTTPException(
            status_code=409,
            detail=(
                f"Human approval refused by hard policy rule {policy_res.policy_rule}: "
                f"{policy_res.reason} Human sign-off cannot override this rule."
            )
        )

    # Policy passed — record the sign-off and execute.
    review.status = ReviewStatus.APPROVED.value
    review.reviewer = req.reviewer
    review.review_notes = req.notes or "Approved by Human Risk Officer"
    review.resolved_at = datetime.utcnow()

    # Planner forecast is informational only (predicted_probability in the
    # execution details); the outcome itself comes from the ground-truth model.
    stored_decision = db.query(DBRecoveryDecision).filter(
        DBRecoveryDecision.decision_id == review.decision_id
    ).first()
    predicted_prob = stored_decision.recovery_probability if stored_decision else 0.5

    exec_result = RecoveryExecutor.execute(
        db=db,
        payment=payment,
        action=action_to_run,
        policy_result=policy_res,
        decision_data={
            "decision_id": review.decision_id,
            "recovery_probability": predicted_prob,
            "risk_level": review.risk_level,
            "failure_type": analysis["failure_type"],
            "reason": review.review_notes
        },
        actor=f"HumanReviewer:{req.reviewer}"
    )

    # Record Audit Event
    append_audit(db, payment.payment_id, "HUMAN_REVIEW_APPROVED",
                 f"HumanReviewer:{req.reviewer}", {
                     "review_id": review_id,
                     "action": action_to_run,
                     "notes": req.notes,
                     "policy_rule": policy_res.policy_rule
                 })
    db.commit()

    return {
        "review_id": review_id,
        "status": ReviewStatus.APPROVED.value,
        "payment_status": payment.status,
        "policy": {
            "allowed": policy_res.allowed,
            "policy_rule": policy_res.policy_rule,
            "reason": policy_res.reason
        },
        "execution": exec_result
    }

@router.post("/{review_id}/reject")
def reject_review(review_id: str, req: HumanReviewActionRequest, db: Session = Depends(get_db)):
    """
    Human Administrator rejects the recovery action (Safe Stop).
    """
    review = db.query(DBHumanReview).filter(DBHumanReview.review_id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review task not found")
    if review.status != ReviewStatus.PENDING.value:
        raise HTTPException(status_code=400, detail=f"Review is already {review.status}")

    payment = db.query(DBPayment).filter(DBPayment.payment_id == review.payment_id).first()
    if payment:
        payment.status = PaymentStatus.STOPPED.value

    review.status = ReviewStatus.REJECTED.value
    review.reviewer = req.reviewer
    review.review_notes = req.notes or "Rejected by Human Risk Officer due to elevated fraud risk."
    review.resolved_at = datetime.utcnow()

    # Record Audit Event
    if payment:
        append_audit(db, payment.payment_id, "HUMAN_REVIEW_REJECTED",
                     f"HumanReviewer:{req.reviewer}", {"review_id": review_id, "notes": req.notes})
    db.commit()

    return {
        "review_id": review_id,
        "status": ReviewStatus.REJECTED.value,
        "message": "Recovery rejected. Transaction safely stopped."
    }
