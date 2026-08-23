"""Single accessor for the active merchant policy configuration (previously
duplicated verbatim in three routers)."""
from datetime import datetime

from sqlalchemy.orm import Session

from ..models import DBPolicyConfig


def get_active_policy_config(db: Session) -> DBPolicyConfig:
    config = db.query(DBPolicyConfig).first()
    if not config:
        config = DBPolicyConfig(
            max_autonomous_retry_attempts=2,
            max_autonomous_amount=25000.0,
            require_human_high_risk=True,
            stop_on_repeated_failure=True,
            require_customer_consent_for_nudge=True,
            escalate_unknown_failure=True,
            vulcan_enabled=True,
            updated_at=datetime.utcnow()
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config
