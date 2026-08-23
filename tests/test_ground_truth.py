"""
Ground-truth benchmark integrity tests.

These tests guard the property that makes the evaluation honest: outcomes come
from a seeded generative model that is INDEPENDENT of the planner. If any of
these fail, the benchmark has regressed into measuring the model against itself.
"""
import os
import sys

import pytest

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models import DBPayment, PaymentStatus, RecoveryAction
from app.core.outcome_model import (
    GT_SEED,
    assign_ground_truth,
    latent_recovery_prob,
    simulate_action_outcome,
)
from app.core.seed_data import seed_database
from app.agents.recovery_executor import RecoveryExecutor
from app.api.evaluation import run_evaluation_benchmark
from app.policy.rules import PolicyEvaluationResult


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSession()
    yield db
    db.close()


def test_ground_truth_assignment_is_deterministic():
    meta = {"past_successful_payments": 8, "risk_score": 0.1, "has_messaging_consent": True}
    first = assign_ground_truth("pay_det_check", "TEMPORARY_NETWORK_FAILURE", 4500.0, meta)
    second = assign_ground_truth("pay_det_check", "TEMPORARY_NETWORK_FAILURE", 4500.0, meta)
    assert first == second
    recoverable, prob, seed = first
    assert isinstance(recoverable, bool)
    assert 0.02 <= prob <= 0.97
    assert isinstance(seed, int)


def test_action_outcome_is_deterministic_and_bounded():
    assert simulate_action_outcome(True, 7, "RETRY", "TEMPORARY_NETWORK_FAILURE") == \
        simulate_action_outcome(True, 7, "RETRY", "TEMPORARY_NETWORK_FAILURE")
    # Non-monetary actions never settle money themselves
    assert simulate_action_outcome(True, 7, RecoveryAction.HUMAN_REVIEW.value, "TEMPORARY_NETWORK_FAILURE") is False
    assert simulate_action_outcome(True, 7, RecoveryAction.STOP.value, "TEMPORARY_NETWORK_FAILURE") is False
    # An unrecoverable payment cannot be recovered by ANY action
    for action in ("RETRY", "DELAYED_RETRY", "ALTERNATE_METHOD", "PAYMENT_LINK"):
        assert simulate_action_outcome(False, 7, action, "TEMPORARY_NETWORK_FAILURE") is False


def test_latent_probability_uses_seed_time_facts_only():
    base_meta = {"past_successful_payments": 10, "risk_score": 0.05, "has_messaging_consent": True}
    p_good = latent_recovery_prob("TEMPORARY_NETWORK_FAILURE", 3000.0, base_meta)
    p_risky = latent_recovery_prob("TEMPORARY_NETWORK_FAILURE", 3000.0, {**base_meta, "risk_score": 0.9})
    p_big = latent_recovery_prob("TEMPORARY_NETWORK_FAILURE", 400000.0, base_meta)
    assert p_risky < p_good
    assert p_big < p_good


def test_planner_prediction_cannot_influence_outcome(test_db):
    """The circularity regression test: a sky-high planner probability must NOT
    make an unrecoverable payment succeed."""
    payment = DBPayment(
        payment_id="pay_gt_unrecoverable",
        customer_id="cust_gt",
        customer_name="Test Customer",
        amount=1999.0,
        currency="INR",
        payment_method="upi",
        status=PaymentStatus.FAILED.value,
        failure_reason="Bank network timeout",
        error_code="GATEWAY_TIMEOUT",
        retry_count=0,
        ground_truth_recoverable=False,  # latently unrecoverable
        ground_truth_prob=0.1,
        outcome_seed=7,
    )
    test_db.add(payment)
    test_db.commit()

    approved = PolicyEvaluationResult(allowed=True, policy_rule="POLICY_SATISFIED", reason="test")
    exec_res = RecoveryExecutor.execute(
        db=test_db,
        payment=payment,
        action=RecoveryAction.RETRY.value,
        policy_result=approved,
        decision_data={
            "recovery_probability": 0.99,  # planner is maximally confident — must not matter
            "risk_level": "LOW",
            "failure_type": "TEMPORARY_NETWORK_FAILURE",
            "reason": "test",
        },
    )
    assert exec_res["status"] == "FAILED"
    assert exec_res["amount_recovered"] == 0.0
    assert payment.amount_recovered == 0.0


def _strip_timestamp(result: dict) -> dict:
    return {k: v for k, v in result.items() if k != "evaluated_at"}


def test_evaluation_is_honest_and_reproducible(test_db):
    seed_database(test_db, total_dev=40, total_eval=40)

    first = run_evaluation_benchmark(dataset_split="eval", db=test_db)
    second = run_evaluation_benchmark(dataset_split="eval", db=test_db)

    # Reproducible: two consecutive runs are identical (modulo wall-clock stamp)
    assert _strip_timestamp(first) == _strip_timestamp(second)

    # Honest: Brier of exactly 0 is the circularity smell (prediction == outcome
    # by construction). A genuine forecast against independent outcomes has error.
    assert first["decision_quality"]["brier_score"] > 0.0

    # The benchmark must disclose that it is synthetic and seeded
    assert "Synthetic benchmark" in first["benchmark_disclosure"]
    assert first["generator_seed"] == GT_SEED

    # Confusion matrix and exception list exist and are internally consistent
    conf = first["decision_quality"]["confusion_by_action"]
    assert sum(sum(c.values()) for c in conf.values()) == \
        first["safety_metrics"]["autonomous_actions_within_policy"]
    fp = first["decision_quality"]["false_positives"]
    fn = first["decision_quality"]["false_negatives"]
    assert fp == sum(c["fp"] for c in conf.values())
    assert fn == sum(c["fn"] for c in conf.values())

    # Leakage is measured, not asserted — and with a working policy engine it is 0
    assert first["safety_metrics"]["unsafe_financial_leakage"] == 0.0
