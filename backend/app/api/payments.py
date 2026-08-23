import json
import ast
import uuid
from datetime import datetime
from typing import Optional, List, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import (
    DBPayment, DBPaymentEvent, DBAuditEvent, DBRecoveryDecision, DBPolicyDecision,
    DBRecoveryExecution, DBHumanReview, PaymentEventIngestRequest, PaymentResponse,
    PaymentStatus
)
from ..core.idempotency import IdempotencyManager

router = APIRouter(prefix="/api/payments", tags=["Payments"])

def safe_json_loads(val: Any) -> Dict[str, Any]:
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

@router.post("/events")
def ingest_payment_event(req: PaymentEventIngestRequest, db: Session = Depends(get_db)):
    """
    Ingest a payment failure event with strict idempotency protection.
    """
    is_duplicate, event_record = IdempotencyManager.check_and_register(
        db=db,
        event_id=req.event_id,
        payment_id=req.payment_id,
        event_type="payment.failed",
        payload_json=json.dumps(req.model_dump())
    )

    if is_duplicate:
        return {
            "status": "ALREADY_PROCESSED",
            "message": f"Duplicate event_id '{req.event_id}' ignored safely. No duplicate recovery executed.",
            "payment_id": req.payment_id,
            "event_id": req.event_id,
            "is_duplicate": True
        }

    # Find or create Payment record
    payment = db.query(DBPayment).filter(DBPayment.payment_id == req.payment_id).first()
    if not payment:
        cust_ctx = req.customer_context or {}
        meta = {
            "customer_name": req.customer_name,
            "tenure_months": cust_ctx.get("tenure_months", 6),
            "lifetime_value": cust_ctx.get("lifetime_value", 12000.0),
            "past_successful_payments": cust_ctx.get("past_successful_payments", 5),
            "past_failed_payments": cust_ctx.get("past_failed_payments", 1),
            "preferred_payment_method": req.payment_method,
            "last_successful_payment_days_ago": cust_ctx.get("last_successful_payment_days_ago", 3),
            "risk_score": cust_ctx.get("risk_score", 0.1),
            "has_messaging_consent": cust_ctx.get("has_messaging_consent", True)
        }
        if req.metadata:
            meta.update(req.metadata)

        payment = DBPayment(
            payment_id=req.payment_id,
            customer_id=req.customer_id,
            customer_name=req.customer_name or "Anonymous",
            customer_email=req.customer_email or "",
            customer_phone=req.customer_phone or "",
            amount=req.amount,
            currency=req.currency,
            payment_method=req.payment_method,
            status=PaymentStatus.FAILED.value,
            failure_reason=req.failure_reason,
            error_code=req.error_code or "GENERIC_ERROR",
            retry_count=0,
            amount_recovered=0.0,
            risk_score=meta.get("risk_score", 0.1),
            dataset_split="dev",
            metadata_json=json.dumps(meta),
            created_at=datetime.utcnow()
        )
        db.add(payment)

    # Record Audit Event
    db.add(DBAuditEvent(
        audit_id=f"aud_{uuid.uuid4().hex[:10]}",
        payment_id=req.payment_id,
        event_type="PAYMENT_FAILURE_INGESTED",
        actor="IngestionLayer",
        metadata_json=json.dumps({"event_id": req.event_id, "amount": req.amount, "reason": req.failure_reason}),
        timestamp=datetime.utcnow()
    ))
    db.commit()

    return {
        "status": "ACCEPTED",
        "message": f"Payment failure event for {req.payment_id} (₹{req.amount:,.2f}) persisted.",
        "payment_id": req.payment_id,
        "event_id": req.event_id,
        "is_duplicate": False
    }

@router.get("")
def list_payments(
    status: Optional[str] = None,
    dataset_split: Optional[str] = None,
    payment_method: Optional[str] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    search: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    List payments with dynamic filters.
    """
    query = db.query(DBPayment)
    if status:
        query = query.filter(DBPayment.status == status)
    if dataset_split:
        query = query.filter(DBPayment.dataset_split == dataset_split)
    if payment_method:
        query = query.filter(DBPayment.payment_method == payment_method)
    if min_amount is not None:
        query = query.filter(DBPayment.amount >= min_amount)
    if max_amount is not None:
        query = query.filter(DBPayment.amount <= max_amount)
    if search:
        query = query.filter(
            (DBPayment.payment_id.ilike(f"%{search}%")) |
            (DBPayment.customer_name.ilike(f"%{search}%")) |
            (DBPayment.failure_reason.ilike(f"%{search}%"))
        )

    total = query.count()
    items = query.order_by(DBPayment.created_at.desc()).offset(offset).limit(limit).all()

    result = []
    for p in items:
        meta = safe_json_loads(p.metadata_json)
        result.append({
            "payment_id": p.payment_id,
            "customer_id": p.customer_id,
            "customer_name": p.customer_name,
            "amount": p.amount,
            "currency": p.currency,
            "payment_method": p.payment_method,
            "status": p.status,
            "failure_reason": p.failure_reason,
            "error_code": p.error_code,
            "retry_count": p.retry_count,
            "amount_recovered": p.amount_recovered,
            "risk_score": p.risk_score,
            "dataset_split": p.dataset_split,
            "customer_context": meta,
            "created_at": p.created_at
        })

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "payments": result
    }

@router.get("/{payment_id}")
def get_payment_detail(payment_id: str, db: Session = Depends(get_db)):
    """
    Get full payment detail including audit trail, decisions, and execution records.
    """
    payment = db.query(DBPayment).filter(DBPayment.payment_id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    events = db.query(DBPaymentEvent).filter(DBPaymentEvent.payment_id == payment_id).all()
    decisions = db.query(DBRecoveryDecision).filter(DBRecoveryDecision.payment_id == payment_id).all()
    executions = db.query(DBRecoveryExecution).filter(DBRecoveryExecution.payment_id == payment_id).all()
    audit_events = db.query(DBAuditEvent).filter(DBAuditEvent.payment_id == payment_id).order_by(DBAuditEvent.timestamp.asc()).all()
    reviews = db.query(DBHumanReview).filter(DBHumanReview.payment_id == payment_id).all()

    return {
        "payment": {
            "payment_id": payment.payment_id,
            "customer_id": payment.customer_id,
            "customer_name": payment.customer_name,
            "customer_email": payment.customer_email,
            "customer_phone": payment.customer_phone,
            "amount": payment.amount,
            "currency": payment.currency,
            "payment_method": payment.payment_method,
            "status": payment.status,
            "failure_reason": payment.failure_reason,
            "error_code": payment.error_code,
            "retry_count": payment.retry_count,
            "amount_recovered": payment.amount_recovered,
            "risk_score": payment.risk_score,
            "metadata": safe_json_loads(payment.metadata_json),
            "created_at": payment.created_at,
            "updated_at": payment.updated_at
        },
        "events": [{"event_id": e.event_id, "event_type": e.event_type, "processed": e.processed, "created_at": e.created_at} for e in events],
        "decisions": [
            {
                "decision_id": d.decision_id,
                "failure_type": d.failure_type,
                "recommended_action": d.recommended_action,
                "recovery_probability": d.recovery_probability,
                "risk_level": d.risk_level,
                "expected_net_recovery": d.expected_net_recovery,
                "action_cost": d.action_cost,
                "reason": d.reason,
                "signals": safe_json_loads(d.signals_json),
                "critic_verdict": d.critic_verdict,
                "critic_notes": d.critic_notes,
                "created_at": d.created_at
            }
            for d in decisions
        ],
        "executions": [
            {
                "execution_id": ex.execution_id,
                "action": ex.action,
                "status": ex.status,
                "result": ex.result,
                "amount_recovered": ex.amount_recovered,
                "details": safe_json_loads(ex.details_json),
                "executed_at": ex.executed_at
            }
            for ex in executions
        ],
        "audit_trail": [
            {
                "audit_id": a.audit_id,
                "event_type": a.event_type,
                "actor": a.actor,
                "metadata": safe_json_loads(a.metadata_json),
                "timestamp": a.timestamp
            }
            for a in audit_events
        ],
        "human_reviews": [
            {
                "review_id": r.review_id,
                "status": r.status,
                "reason": r.reason,
                "risk_level": r.risk_level,
                "reviewer": r.reviewer,
                "review_notes": r.review_notes,
                "proposed_action": r.proposed_action,
                "created_at": r.created_at,
                "resolved_at": r.resolved_at
            }
            for r in reviews
        ]
    }
