"""
Optional demo warm-start: process a slice of dev-split payments through the full
agentic pipeline at startup (gated by DEMO_WARM_START=true) so a fresh boot shows
real, non-zero dashboard numbers instead of an all-FAILED dataset.

The two reserved demo payments are never consumed — they must stay FAILED so the
live demo can process them on stage:
- pay_dev_0001: the ₹2,50,000 high-risk refusal moment
- pay_dev_0002: the ₹3,499 successful autonomous recovery
"""
from sqlalchemy.orm import Session

from ..models import DBPayment, DBRecoveryExecution, PaymentStatus

DEMO_RESERVED_PAYMENT_IDS = ("pay_dev_0001", "pay_dev_0002")


def warm_start_demo(db: Session, limit: int = 150) -> int:
    """Runs the full pipeline over up to `limit` dev payments. Idempotent:
    skips entirely if any execution already exists. Returns count processed."""
    if db.query(DBRecoveryExecution).count() > 0:
        return 0

    # Local import to avoid an import cycle (api.recovery imports core modules).
    from ..api.recovery import process_full_recovery_pipeline

    payments = (
        db.query(DBPayment)
        .filter(
            DBPayment.status == PaymentStatus.FAILED.value,
            DBPayment.dataset_split == "dev",
            DBPayment.payment_id.notin_(DEMO_RESERVED_PAYMENT_IDS),
        )
        .limit(limit)
        .all()
    )
    for payment in payments:
        process_full_recovery_pipeline(payment.payment_id, db)
    return len(payments)
