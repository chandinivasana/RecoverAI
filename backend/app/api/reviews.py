import json
import uuid
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
import ast
from ..models import (
    DBHumanReview, DBPayment, DBAuditEvent, DBRecoveryExecution,
    ReviewStatus, PaymentStatus, HumanReviewActionRequest, RecoveryAction
)
from ..policy.rules import PolicyEvaluationResult
from ..agents.recovery_executor import RecoveryExecutor

router = APIRouter(prefix="/api/reviews", tags=["Human Review"])

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
    """
    review = db.query(DBHumanReview).filter(DBHumanReview.review_id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review task not found")
    if review.status != ReviewStatus.PENDING.value:
        raise HTTPException(status_code=400, detail=f"Review is already {review.status}")

    payment = db.query(DBPayment).filter(DBPayment.payment_id == review.payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Associated payment not found")

    action_to_run = req.override_action or review.proposed_action or RecoveryAction.RETRY.value

    # Update Review record
    review.status = ReviewStatus.APPROVED.value
    review.reviewer = req.reviewer
    review.review_notes = req.notes or "Approved by Human Risk Officer"
    review.resolved_at = datetime.utcnow()

    # Create synthetic approved policy result for execution
    manual_policy_result = PolicyEvaluationResult(
        allowed=True,
        policy_rule="HUMAN_SIGN_OFF",
        reason=f"Human override approved by {req.reviewer}: {review.review_notes}"
    )

    # Execute recovery
    exec_result = RecoveryExecutor.execute(
        db=db,
        payment=payment,
        action=action_to_run,
        policy_result=manual_policy_result,
        decision_data={
            "decision_id": review.decision_id,
            "recovery_probability": 0.85,
            "risk_level": review.risk_level,
            "reason": review.review_notes
        },
        actor=f"HumanReviewer:{req.reviewer}"
    )

    # Record Audit Event
    db.add(DBAuditEvent(
        audit_id=f"aud_{uuid.uuid4().hex[:10]}",
        payment_id=payment.payment_id,
        event_type="HUMAN_REVIEW_APPROVED",
        actor=f"HumanReviewer:{req.reviewer}",
        metadata_json=json.dumps({"review_id": review_id, "action": action_to_run, "notes": req.notes}),
        timestamp=datetime.utcnow()
    ))
    db.commit()

    return {
        "review_id": review_id,
        "status": ReviewStatus.APPROVED.value,
        "payment_status": payment.status,
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
        db.add(DBAuditEvent(
            audit_id=f"aud_{uuid.uuid4().hex[:10]}",
            payment_id=payment.payment_id,
            event_type="HUMAN_REVIEW_REJECTED",
            actor=f"HumanReviewer:{req.reviewer}",
            metadata_json=json.dumps({"review_id": review_id, "notes": req.notes}),
            timestamp=datetime.utcnow()
        ))
    db.commit()

    return {
        "review_id": review_id,
        "status": ReviewStatus.REJECTED.value,
        "message": "Recovery rejected. Transaction safely stopped."
    }
