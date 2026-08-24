import json
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.audit import append_audit
from ..core.consent_registry import DPDPConsentRegistry
from ..database import get_db
from ..models import (
    DBPayment,
    DBRecoveryExecution,
    DBRecoveryLink,
    PaymentStatus,
    RecoveryLinkCompleteRequest,
    RecoveryLinkCompleteResponse,
    RecoveryLinkCreateRequest,
    RecoveryLinkResponse,
)

router = APIRouter(prefix="/api/recovery-links", tags=["Dynamic Recovery Links"])


@router.post("/create", response_model=RecoveryLinkResponse)
def create_recovery_link(req: RecoveryLinkCreateRequest, db: Session = Depends(get_db)):
    """
    Creates an interactive dynamic recovery link (WhatsApp/SMS/Email) for a failed payment.
    Verifies DPDP consent before generating communication payloads.
    """
    payment = db.query(DBPayment).filter(DBPayment.payment_id == req.payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    # DPDP Consent verification
    consent_res = DPDPConsentRegistry.check_consent(payment.customer_id, req.channel)
    consent_ok = consent_res.get("allowed") is True
    # If customer context has explicit consent flag, respect it
    if not consent_ok and payment.metadata_json:
        try:
            meta = json.loads(payment.metadata_json)
            if meta.get("has_messaging_consent", False):
                consent_ok = True
        except Exception:
            pass

    link_id = f"lnk_{uuid.uuid4().hex[:10]}"
    short_url = f"https://pay.recoverai.in/r/{link_id}"
    expires_at = datetime.utcnow() + timedelta(minutes=req.custom_expiry_minutes)

    alternate_methods = ["upi", "card", "netbanking", "wallet"]
    if payment.payment_method.lower() in alternate_methods:
        alternate_methods.remove(payment.payment_method.lower())

    suggested = "upi" if payment.payment_method.lower() != "upi" else "card"

    # Friendly personalized message
    cust_name = payment.customer_name or "there"
    discount_text = f" We've applied a ₹{req.discount_amount:,.0f} courtesy waiver." if req.discount_amount > 0 else ""
    msg = (
        req.custom_message
        or f"Hi {cust_name}, your payment of ₹{payment.amount:,.2f} for order #{payment.payment_id[-6:]} was interrupted.{discount_text} "
           f"Tap here to instantly complete with 1-click UPI/Card: {short_url}"
    )

    recovery_link = DBRecoveryLink(
        link_id=link_id,
        payment_id=payment.payment_id,
        customer_id=payment.customer_id,
        customer_name=payment.customer_name or "Anonymous",
        customer_phone=payment.customer_phone or "",
        customer_email=payment.customer_email or "",
        amount=payment.amount - req.discount_amount,
        currency=payment.currency,
        channel=req.channel,
        short_url=short_url,
        status="ACTIVE",
        discount_amount=req.discount_amount,
        failure_reason=payment.failure_reason,
        suggested_method=suggested,
        alternate_methods_json=json.dumps(alternate_methods),
        message_content=msg,
        dpdp_consent_verified=consent_ok,
        expires_at=expires_at,
        created_at=datetime.utcnow(),
    )
    db.add(recovery_link)

    # Tamper-evident audit log
    append_audit(
        db,
        payment.payment_id,
        "DYNAMIC_RECOVERY_LINK_GENERATED",
        "RecoveryLinkService",
        {
            "link_id": link_id,
            "channel": req.channel,
            "short_url": short_url,
            "discount_amount": req.discount_amount,
            "dpdp_consent_verified": consent_ok,
            "expires_at": expires_at.isoformat(),
        },
    )
    db.commit()
    db.refresh(recovery_link)

    return _to_link_response(recovery_link)


@router.get("/{link_id}", response_model=RecoveryLinkResponse)
def get_recovery_link(link_id: str, db: Session = Depends(get_db)):
    """Fetches details of a dynamic recovery link."""
    link = db.query(DBRecoveryLink).filter(DBRecoveryLink.link_id == link_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Recovery link not found or expired")

    # Check expiration
    if link.status == "ACTIVE" and datetime.utcnow() > link.expires_at:
        link.status = "EXPIRED"
        db.commit()

    return _to_link_response(link)


@router.post("/{link_id}/complete", response_model=RecoveryLinkCompleteResponse)
def complete_recovery_link_payment(
    link_id: str,
    req: RecoveryLinkCompleteRequest,
    db: Session = Depends(get_db)
):
    """
    Executes 1-click recovery when the customer pays through the dynamic recovery link.
    Settle payment, update ledger, and append tamper-evident hash-chained audit record.
    """
    link = db.query(DBRecoveryLink).filter(DBRecoveryLink.link_id == link_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Recovery link not found")

    if link.status == "COMPLETED":
        return RecoveryLinkCompleteResponse(
            link_id=link.link_id,
            payment_id=link.payment_id,
            status="ALREADY_COMPLETED",
            amount_recovered=link.amount,
            recovery_method=req.payment_method,
            execution_id="exec_already_settled",
            audit_hash="0000000000000000",
            message="Payment was already successfully recovered."
        )

    if link.status == "EXPIRED" or datetime.utcnow() > link.expires_at:
        link.status = "EXPIRED"
        db.commit()
        raise HTTPException(status_code=410, detail="This recovery link has expired")

    # Update Link State
    link.status = "COMPLETED"
    link.completed_at = datetime.utcnow()

    # Update DBPayment
    payment = db.query(DBPayment).filter(DBPayment.payment_id == link.payment_id).first()
    if payment:
        payment.status = PaymentStatus.RECOVERED.value
        payment.amount_recovered = link.amount

    # Create Execution Record
    exec_id = f"exec_{uuid.uuid4().hex[:10]}"
    decision_id = f"dec_{uuid.uuid4().hex[:10]}"
    execution = DBRecoveryExecution(
        execution_id=exec_id,
        payment_id=link.payment_id,
        decision_id=decision_id,
        action="PAYMENT_LINK",
        status="SUCCESS",
        result=f"Customer completed payment via {req.payment_method.upper()} through RecoverAI Dynamic Link.",
        amount_recovered=link.amount,
        details_json=json.dumps({
            "link_id": link.link_id,
            "method": req.payment_method,
            "upi_id": req.upi_id,
            "notes": req.notes
        }),
        executed_at=datetime.utcnow()
    )
    db.add(execution)

    # Append Tamper-Evident Audit Event
    audit_evt = append_audit(
        db,
        link.payment_id,
        "DYNAMIC_RECOVERY_PAYMENT_SETTLED",
        "DynamicLinkSettler",
        {
            "link_id": link.link_id,
            "execution_id": exec_id,
            "amount_recovered": link.amount,
            "channel": link.channel,
            "method_used": req.payment_method,
            "customer_id": link.customer_id
        }
    )
    db.commit()

    return RecoveryLinkCompleteResponse(
        link_id=link.link_id,
        payment_id=link.payment_id,
        status="SUCCESS",
        amount_recovered=link.amount,
        recovery_method=req.payment_method,
        execution_id=exec_id,
        audit_hash=audit_evt.entry_hash or "chain_intact",
        message="Payment recovered successfully via dynamic interactive recovery link."
    )


@router.get("", response_model=list[RecoveryLinkResponse])
def list_recovery_links(limit: int = 50, db: Session = Depends(get_db)):
    """List recent dynamic recovery links."""
    links = db.query(DBRecoveryLink).order_by(DBRecoveryLink.id.desc()).limit(limit).all()
    return [_to_link_response(item) for item in links]


def _to_link_response(link: DBRecoveryLink) -> RecoveryLinkResponse:
    alt_methods = []
    if link.alternate_methods_json:
        try:
            alt_methods = json.loads(link.alternate_methods_json)
        except Exception:
            alt_methods = []

    return RecoveryLinkResponse(
        link_id=link.link_id,
        payment_id=link.payment_id,
        customer_id=link.customer_id,
        customer_name=link.customer_name,
        customer_phone=link.customer_phone,
        customer_email=link.customer_email,
        amount=link.amount,
        currency=link.currency,
        channel=link.channel,
        short_url=link.short_url,
        status=link.status,
        discount_amount=link.discount_amount,
        failure_reason=link.failure_reason,
        suggested_method=link.suggested_method,
        alternate_methods=alt_methods,
        message_content=link.message_content,
        dpdp_consent_verified=link.dpdp_consent_verified,
        expires_at=link.expires_at,
        completed_at=link.completed_at,
        created_at=link.created_at,
    )
