from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..core.audit import verify_chain
from ..database import get_db

router = APIRouter(prefix="/api/audit", tags=["Audit"])


@router.get("/verify")
def verify_audit_chain(db: Session = Depends(get_db)):
    """
    Walks the tamper-evident SHA-256 audit hash chain end-to-end, recomputing
    every hash. Returns intact=True with the head hash, or the first broken
    link (position, audit_id, reason) if any historical event was edited,
    deleted, or reordered.
    """
    return verify_chain(db)
