"""
Tamper-evident audit chain.

Every audit event is appended through `append_audit`, which links it to the
previous event with a SHA-256 hash over a canonical JSON payload:

    entry_hash = sha256(prev_hash + canonical(audit_id, payment_id, event_type,
                                              actor, metadata_json, timestamp))

Editing, deleting, or reordering ANY historical row breaks every hash from that
point forward, and `verify_chain` reports the first broken link. This makes the
trail *tamper-evident* — an honest, verifiable property — as opposed to
"immutable" or "cryptographically signed", which a plain database table is not.

Rules:
- All writers MUST use append_audit(); never construct DBAuditEvent directly.
- append_audit flushes (so chained ordering survives autoflush=False sessions)
  but does not commit — the caller owns the transaction.
"""
import hashlib
import json
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from ..models import DBAuditEvent

GENESIS_HASH = "0" * 64


def _canonical_payload(audit_id: str, payment_id: str, event_type: str,
                       actor: str, metadata_json: str, timestamp_iso: str) -> str:
    return json.dumps(
        {
            "audit_id": audit_id,
            "payment_id": payment_id,
            "event_type": event_type,
            "actor": actor,
            "metadata_json": metadata_json,
            "timestamp": timestamp_iso,
        },
        sort_keys=True,
        separators=(",", ":"),
    )


def _entry_hash(prev_hash: str, canonical: str) -> str:
    return hashlib.sha256((prev_hash + canonical).encode("utf-8")).hexdigest()


def append_audit(
    db: Session,
    payment_id: str,
    event_type: str,
    actor: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> DBAuditEvent:
    """Appends one event to the global audit hash chain and returns the row."""
    last = db.query(DBAuditEvent).order_by(DBAuditEvent.id.desc()).first()
    prev_hash = last.entry_hash if (last and last.entry_hash) else GENESIS_HASH

    audit_id = f"aud_{uuid.uuid4().hex[:10]}"
    timestamp = datetime.utcnow()
    metadata_json = json.dumps(metadata or {})
    canonical = _canonical_payload(
        audit_id, payment_id, event_type, actor, metadata_json, timestamp.isoformat()
    )

    event = DBAuditEvent(
        audit_id=audit_id,
        payment_id=payment_id,
        event_type=event_type,
        actor=actor,
        metadata_json=metadata_json,
        timestamp=timestamp,
        prev_hash=prev_hash,
        entry_hash=_entry_hash(prev_hash, canonical),
    )
    db.add(event)
    # Flush so the row is visible to the next append within the same
    # (autoflush=False) transaction — chain ordering must never fork.
    db.flush()
    return event


def verify_chain(db: Session) -> Dict[str, Any]:
    """
    Walks the full chain in insertion order and recomputes every hash.
    Returns intact=True, or the first broken link with a reason:
    - LINKAGE_BROKEN: prev_hash doesn't match the previous entry (row deleted,
      reordered, or inserted out-of-band)
    - CONTENT_MISMATCH: the row's content no longer matches its recorded hash
      (row edited after the fact)
    """
    rows = db.query(DBAuditEvent).order_by(DBAuditEvent.id.asc()).all()
    chained = [r for r in rows if r.entry_hash]
    unchained_legacy = len(rows) - len(chained)

    prev = GENESIS_HASH
    for position, row in enumerate(chained, start=1):
        if row.prev_hash != prev:
            return {
                "intact": False,
                "chained_events": len(chained),
                "unchained_legacy_events": unchained_legacy,
                "first_broken_link": {
                    "position": position,
                    "audit_id": row.audit_id,
                    "payment_id": row.payment_id,
                    "event_type": row.event_type,
                    "reason": "LINKAGE_BROKEN",
                    "detail": "prev_hash does not match the previous entry — a row was deleted, reordered, or inserted out-of-band.",
                },
            }
        canonical = _canonical_payload(
            row.audit_id, row.payment_id, row.event_type,
            row.actor, row.metadata_json, row.timestamp.isoformat()
        )
        if _entry_hash(row.prev_hash, canonical) != row.entry_hash:
            return {
                "intact": False,
                "chained_events": len(chained),
                "unchained_legacy_events": unchained_legacy,
                "first_broken_link": {
                    "position": position,
                    "audit_id": row.audit_id,
                    "payment_id": row.payment_id,
                    "event_type": row.event_type,
                    "reason": "CONTENT_MISMATCH",
                    "detail": "Row content no longer matches its recorded hash — the row was edited after being written.",
                },
            }
        prev = row.entry_hash

    return {
        "intact": True,
        "chained_events": len(chained),
        "unchained_legacy_events": unchained_legacy,
        "head_hash": prev if chained else None,
    }
