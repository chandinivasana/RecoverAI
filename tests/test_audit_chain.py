"""
Tamper-evident audit chain tests (Phase 3).

The chain's guarantees: every writer goes through append_audit; edits break the
tampered link (CONTENT_MISMATCH); deletions/reorderings break linkage
(LINKAGE_BROKEN); and the chain never forks even when several events are
appended inside one uncommitted transaction (autoflush=False sessions).
"""
import json
import os
import sys

import pytest

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models import DBAuditEvent, DBPayment, DBPolicyConfig, PaymentStatus
from app.core.audit import GENESIS_HASH, append_audit, verify_chain
from app.api.recovery import process_full_recovery_pipeline


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSession()
    db.add(DBPolicyConfig(
        max_autonomous_retry_attempts=2,
        max_autonomous_amount=25000.0,
        require_human_high_risk=True,
        stop_on_repeated_failure=True,
        require_customer_consent_for_nudge=True,
        escalate_unknown_failure=True,
        vulcan_enabled=True
    ))
    db.commit()
    yield db
    db.close()


def test_chain_does_not_fork_within_one_transaction(test_db):
    # Two appends BEFORE any commit must still link (append_audit flushes).
    first = append_audit(test_db, "pay_chain", "EVENT_A", "System", {"n": 1})
    second = append_audit(test_db, "pay_chain", "EVENT_B", "System", {"n": 2})
    test_db.commit()

    assert first.prev_hash == GENESIS_HASH
    assert second.prev_hash == first.entry_hash
    assert verify_chain(test_db)["intact"] is True


def test_deletion_breaks_linkage(test_db):
    append_audit(test_db, "pay_del", "EVENT_A", "System", {"n": 1})
    victim = append_audit(test_db, "pay_del", "EVENT_B", "System", {"n": 2})
    append_audit(test_db, "pay_del", "EVENT_C", "System", {"n": 3})
    test_db.commit()

    test_db.delete(victim)
    test_db.commit()

    result = verify_chain(test_db)
    assert result["intact"] is False
    assert result["first_broken_link"]["reason"] == "LINKAGE_BROKEN"
    assert result["first_broken_link"]["position"] == 2  # the event after the deleted one


def test_full_pipeline_produces_intact_chain(test_db):
    payment = DBPayment(
        payment_id="pay_chain_pipeline",
        customer_id="cust_chain",
        customer_name="Chain Test",
        amount=3499.0,
        currency="INR",
        payment_method="upi",
        status=PaymentStatus.FAILED.value,
        failure_reason="Bank network timeout",
        error_code="GATEWAY_TIMEOUT",
        retry_count=0,
        ground_truth_recoverable=True,
        ground_truth_prob=0.9,
        outcome_seed=7,
        metadata_json=json.dumps({"past_successful_payments": 10, "risk_score": 0.05, "has_messaging_consent": True})
    )
    test_db.add(payment)
    test_db.commit()

    process_full_recovery_pipeline("pay_chain_pipeline", test_db)

    result = verify_chain(test_db)
    assert result["intact"] is True
    assert result["chained_events"] >= 2  # at least policy + execution events
    # Every audit row carries its chain fields
    rows = test_db.query(DBAuditEvent).all()
    assert all(r.entry_hash and r.prev_hash for r in rows)
