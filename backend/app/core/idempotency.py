from datetime import datetime

from sqlalchemy.orm import Session

from ..models import DBPaymentEvent


class IdempotencyManager:
    @staticmethod
    def check_and_register(db: Session, event_id: str, payment_id: str, event_type: str, payload_json: str) -> tuple[bool, DBPaymentEvent | None]:
        """
        Returns (is_duplicate: bool, event_record)
        If event_id has already been processed, returns (True, existing_event).
        Otherwise registers the event and returns (False, new_event).
        """
        existing = db.query(DBPaymentEvent).filter(DBPaymentEvent.event_id == event_id).first()
        if existing:
            return True, existing
        
        new_event = DBPaymentEvent(
            event_id=event_id,
            payment_id=payment_id,
            event_type=event_type,
            payload_json=payload_json,
            processed=False,
            created_at=datetime.utcnow()
        )
        db.add(new_event)
        db.commit()
        db.refresh(new_event)
        return False, new_event

    @staticmethod
    def mark_processed(db: Session, event_id: str):
        evt = db.query(DBPaymentEvent).filter(DBPaymentEvent.event_id == event_id).first()
        if evt:
            evt.processed = True
            evt.processed_at = datetime.utcnow()
            db.commit()
