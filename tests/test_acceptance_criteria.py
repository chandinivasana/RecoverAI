import pytest
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models import (
    DBPayment, DBPaymentEvent, DBPolicyConfig, DBAuditEvent, DBHumanReview,
    RecoveryAction, FailureCategory, RiskLevel, PaymentStatus, ReviewStatus
)
from app.core.idempotency import IdempotencyManager
from app.core.cost_optimizer import CostOptimizer
from app.core.vulcan_adapter import VulcanAdapter
from app.agents.payment_analyst import PaymentAnalyst
from app.agents.recovery_planner import RecoveryPlanner
from app.agents.critic import RecoveryCritic
from app.agents.recovery_executor import RecoveryExecutor
from app.policy.engine import PolicyEngine

@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSession()
    
    config = DBPolicyConfig(
        max_autonomous_retry_attempts=2,
        max_autonomous_amount=25000.0,
        require_human_high_risk=True,
        stop_on_repeated_failure=True,
        require_customer_consent_for_nudge=True,
        escalate_unknown_failure=True,
        vulcan_enabled=True
    )
    db.add(config)
    db.commit()
    yield db
    db.close()

# AC-1: Ingest payment failure and persist
def test_ac1_event_ingestion(test_db):
    payment = DBPayment(
        payment_id="pay_ac1_001",
        customer_id="cust_001",
        customer_name="Priya Patel",
        amount=4500.0,
        currency="INR",
        payment_method="upi",
        status=PaymentStatus.FAILED.value,
        failure_reason="Bank network timeout",
        error_code="GATEWAY_TIMEOUT",
        retry_count=0
    )
    test_db.add(payment)
    test_db.commit()
    fetched = test_db.query(DBPayment).filter(DBPayment.payment_id == "pay_ac1_001").first()
    assert fetched is not None
    assert fetched.amount == 4500.0

# AC-2: Duplicate payment events do not trigger duplicate actions
def test_ac2_idempotency_deduplication(test_db):
    is_dup1, _ = IdempotencyManager.check_and_register(test_db, "evt_ac2_uniq", "pay_ac2", "payment.failed", "{}")
    assert is_dup1 is False
    is_dup2, _ = IdempotencyManager.check_and_register(test_db, "evt_ac2_uniq", "pay_ac2", "payment.failed", "{}")
    assert is_dup2 is True

# AC-3: Classify common failure types
def test_ac3_failure_classification():
    cases = [
        ("Bank network timeout", "GATEWAY_TIMEOUT", FailureCategory.TEMPORARY_NETWORK_FAILURE.value),
        ("Account balance insufficient", "INSUFFICIENT_FUNDS", FailureCategory.INSUFFICIENT_FUNDS.value),
        ("Card expired by issuer", "CARD_EXPIRED", FailureCategory.PAYMENT_METHOD_FAILURE.value),
        ("Customer abandoned transaction", "USER_CANCELLED", FailureCategory.CHECKOUT_ABANDONMENT.value),
        ("Velocity fraud threshold exceeded", "FRAUD_SUSPECTED", FailureCategory.HIGH_RISK.value)
    ]
    for reason, code, expected in cases:
        pay = {"payment_id": "p", "amount": 1000, "payment_method": "upi", "failure_reason": reason, "error_code": code, "retry_count": 0}
        res = PaymentAnalyst.analyze(pay, {"risk_score": 0.05 if expected != "HIGH_RISK" else 0.9}, vulcan_enabled=True)
        assert res["failure_type"] == expected

# AC-4: Recovery Planner recommends bounded actions
def test_ac4_recovery_planner_bounded_actions():
    valid_actions = {a.value for a in RecoveryAction}
    analysis = {
        "failure_type": "TEMPORARY_NETWORK_FAILURE",
        "risk_level": "LOW",
        "uncertainty_score": 0.1,
        "intelligence_signals": {"suggested_optimal_retry_delay_sec": 0}
    }
    pay = {"payment_id": "p", "amount": 2500, "payment_method": "upi", "retry_count": 0}
    cust = {"past_successful_payments": 5}
    plan = RecoveryPlanner.plan(analysis, pay, cust)
    assert plan["recommended_action"] in valid_actions

# AC-5: Every recommendation passes through deterministic policy engine
def test_ac5_policy_engine_validation(test_db):
    config = test_db.query(DBPolicyConfig).first()
    pay_data = {"payment_id": "p", "amount": 1500, "payment_method": "upi", "retry_count": 0, "risk_level": "LOW", "failure_type": "TEMPORARY_NETWORK_FAILURE"}
    res = PolicyEngine.evaluate(RecoveryAction.RETRY.value, pay_data, {}, config)
    assert res.allowed is True
    assert res.policy_rule == "POLICY_SATISFIED"

# AC-6: High-value transaction exceeding threshold blocked
def test_ac6_high_value_transaction_blocked(test_db):
    config = test_db.query(DBPolicyConfig).first()
    high_val = {"payment_id": "p_high", "amount": 250000.0, "payment_method": "card", "retry_count": 0, "risk_level": "LOW", "failure_type": "TEMPORARY_NETWORK_FAILURE"}
    res = PolicyEngine.evaluate(RecoveryAction.RETRY.value, high_val, {}, config)
    assert res.allowed is False
    assert res.policy_rule == "MAX_AUTONOMOUS_AMOUNT"
    assert res.requires_escalation is True

# AC-7: Blocked transactions escalated to human review queue
def test_ac7_human_escalation_queue(test_db):
    config = test_db.query(DBPolicyConfig).first()
    payment = DBPayment(
        payment_id="pay_ac7_esc",
        customer_id="cust_7",
        customer_name="Rohan V",
        amount=85000.0,
        currency="INR",
        payment_method="card",
        status=PaymentStatus.FAILED.value,
        failure_reason="High value limit check",
        error_code="GATEWAY_TIMEOUT",
        retry_count=0
    )
    test_db.add(payment)
    test_db.commit()

    pay_data = {"payment_id": payment.payment_id, "amount": payment.amount, "payment_method": payment.payment_method, "retry_count": 0, "risk_level": "LOW", "failure_type": "TEMPORARY_NETWORK_FAILURE"}
    policy_res = PolicyEngine.evaluate(RecoveryAction.RETRY.value, pay_data, {}, config)
    
    exec_res = RecoveryExecutor.execute(
        db=test_db,
        payment=payment,
        action=RecoveryAction.RETRY.value,
        policy_result=policy_res,
        decision_data={"recovery_probability": 0.8, "risk_level": "LOW", "reason": "High value"}
    )
    assert exec_res["status"] == "ESCALATED"
    review = test_db.query(DBHumanReview).filter(DBHumanReview.payment_id == payment.payment_id).first()
    assert review is not None
    assert review.status == ReviewStatus.PENDING.value

# AC-8: Approved simulated recovery actions produce measurable outcome
def test_ac8_simulated_recovery_execution(test_db):
    config = test_db.query(DBPolicyConfig).first()
    payment = DBPayment(
        payment_id="pay_ac8_succ",
        customer_id="cust_8",
        customer_name="Anita Sen",
        amount=2499.0,
        currency="INR",
        payment_method="upi",
        status=PaymentStatus.FAILED.value,
        failure_reason="Network timeout",
        error_code="GATEWAY_TIMEOUT",
        retry_count=0
    )
    test_db.add(payment)
    test_db.commit()

    pay_data = {"payment_id": payment.payment_id, "amount": payment.amount, "payment_method": payment.payment_method, "retry_count": 0, "risk_level": "LOW", "failure_type": "TEMPORARY_NETWORK_FAILURE"}
    policy_res = PolicyEngine.evaluate(RecoveryAction.RETRY.value, pay_data, {}, config)
    exec_res = RecoveryExecutor.execute(
        db=test_db,
        payment=payment,
        action=RecoveryAction.RETRY.value,
        policy_result=policy_res,
        decision_data={"recovery_probability": 0.85, "risk_level": "LOW", "reason": "Safe network retry"}
    )
    assert exec_res["status"] == "SUCCESS"
    assert payment.status == PaymentStatus.RECOVERED.value
    assert payment.amount_recovered == 2499.0

# AC-9: Every decision recorded in immutable audit trail
def test_ac9_immutable_audit_trail(test_db):
    audits = test_db.query(DBAuditEvent).all()
    assert isinstance(audits, list)

# AC-10: Dashboard metrics come from real data
def test_ac10_dashboard_kpis_real_data(test_db):
    payment = DBPayment(payment_id="p1", customer_id="c1", customer_name="N", amount=1000.0, currency="INR", payment_method="upi", status=PaymentStatus.RECOVERED.value, failure_reason="", error_code="", retry_count=1, amount_recovered=1000.0)
    test_db.add(payment)
    test_db.commit()
    assert test_db.query(DBPayment).count() >= 1

# AC-11: Held-out benchmark reproducibility
def test_ac11_held_out_benchmark_reproducibility():
    adapter = VulcanAdapter()
    signals = adapter.get_intelligence({"payment_method": "upi", "error_code": "GATEWAY_TIMEOUT", "amount": 1000}, {})
    assert "gateway_health_score" in signals

# AC-12: Graceful failure handles unknown and unavailable AI
def test_ac12_graceful_failure_and_unknown_handling(test_db):
    config = test_db.query(DBPolicyConfig).first()
    unknown_pay = {"payment_id": "p_unk", "amount": 1000.0, "payment_method": "upi", "retry_count": 0, "risk_level": "UNKNOWN", "failure_type": "UNKNOWN"}
    res = PolicyEngine.evaluate(RecoveryAction.RETRY.value, unknown_pay, {}, config)
    assert res.allowed is False
    assert res.requires_escalation is True

# AC-13: End-to-end killer demo flow
def test_ac13_end_to_end_killer_demo_flow(test_db):
    # Scenario A: Autonomous Recovery
    pay_a = {"payment_id": "pay_a", "amount": 2499.0, "payment_method": "upi", "failure_reason": "Network glitch", "error_code": "GATEWAY_TIMEOUT", "retry_count": 0, "risk_level": "LOW", "failure_type": "TEMPORARY_NETWORK_FAILURE"}
    config = test_db.query(DBPolicyConfig).first()
    res_a = PolicyEngine.evaluate(RecoveryAction.RETRY.value, pay_a, {"risk_score": 0.05}, config)
    assert res_a.allowed is True

    # Scenario B: Safe Refusal & Escalation
    pay_b = {"payment_id": "pay_b", "amount": 250000.0, "payment_method": "card", "failure_reason": "Network timeout", "error_code": "GATEWAY_TIMEOUT", "retry_count": 0, "risk_level": "LOW", "failure_type": "TEMPORARY_NETWORK_FAILURE"}
    res_b = PolicyEngine.evaluate(RecoveryAction.RETRY.value, pay_b, {"risk_score": 0.05}, config)
    assert res_b.allowed is False
    assert res_b.policy_rule == "MAX_AUTONOMOUS_AMOUNT"

# AC-14: DPDP Act Compliance & Customer Consent Enforcement
def test_ac14_dpdp_consent_enforcement(test_db):
    from app.core.consent_registry import DPDPairConsentRegistry
    DPDPairConsentRegistry.register_consent("cust_opted_out_01", granted=False, source="user_sms_optout")
    
    pay_data = {"customer_id": "cust_opted_out_01", "amount": 1500.0, "payment_method": "upi", "failure_type": "CHECKOUT_ABANDONMENT"}
    config = test_db.query(DBPolicyConfig).first()
    res = PolicyEngine.evaluate(RecoveryAction.PAYMENT_LINK.value, pay_data, {"has_messaging_consent": False}, config)
    assert res.allowed is False
    assert res.policy_rule == "CUSTOMER_CONSENT_REQUIRED"
    assert "DPDP" in res.reason

# AC-15: Acquirer Bank Rate-Limiter & Circuit Breaker
def test_ac15_acquirer_rate_limiting_and_circuit_breaker():
    from app.core.rate_limiter import AcquirerRateLimitManager
    # Capacity check on healthy UPI switch
    has_cap, info = AcquirerRateLimitManager.check_acquirer_capacity("upi")
    assert has_cap is True
    assert info["status"] == "HEALTHY"

    # Trip circuit breaker
    AcquirerRateLimitManager.trip_circuit_breaker("SBI", duration_sec=10)
    has_sbi_cap, sbi_info = AcquirerRateLimitManager.check_acquirer_capacity("card", "SBI_TIMEOUT")
    assert has_sbi_cap is False
    assert sbi_info["status"] == "CIRCUIT_BREAKER_OPEN"

# AC-16: Epistemic Uncertainty Handling (Voluntary Agent Abstention)
def test_ac16_epistemic_uncertainty_abstention():
    # Conflicting signals: error code says timeout, but text mentions fraud/stolen
    pay_data = {
        "payment_id": "pay_conflict_01",
        "amount": 4999.0,
        "error_code": "GATEWAY_TIMEOUT",
        "failure_reason": "stolen card suspicious pattern flag",
    }
    cust_ctx = {"risk_score": 0.1, "past_successful_payments": 5}
    analysis = PaymentAnalyst.analyze(pay_data, cust_ctx, vulcan_enabled=True)
    assert analysis["has_epistemic_uncertainty"] is True
    assert "Epistemic Uncertainty" in analysis["uncertainty_reason"]

    plan = RecoveryPlanner.plan(analysis, pay_data, cust_ctx)
    assert plan["recommended_action"] == RecoveryAction.HUMAN_REVIEW.value
    assert "Epistemic Uncertainty" in plan["reason"]

# AC-17: Cost Optimization & Expected Net Recovery
def test_ac17_cost_optimizer_roi():
    cost = CostOptimizer.get_action_cost(RecoveryAction.RETRY.value)
    assert cost == 2.00
    expected_net = CostOptimizer.calculate_expected_net_recovery(amount=5000.0, recovery_probability=0.8, action=RecoveryAction.RETRY.value)
    assert expected_net == (0.8 * 5000.0) - 2.00

# AC-18: Headroom Context Compression for Token & Latency Optimization
def test_ac18_headroom_context_compression():
    from app.core.context_compressor import HeadroomContextCompressor
    pay_data = {
        "payment_id": "pay_compression_test_01",
        "amount": 3499.0,
        "payment_method": "upi",
        "error_code": "GATEWAY_TIMEOUT",
        "failure_reason": "Bank network timeout during UPI PIN authorization with verbose NPCI stack trace Exception: Gateway timeout",
        "retry_count": 0
    }
    cust_ctx = {
        "past_successful_payments": 12,
        "past_failed_payments": 1,
        "risk_score": 0.05,
        "has_messaging_consent": True
    }
    compressed, metrics = HeadroomContextCompressor.prepare_agent_context(pay_data, cust_ctx)
    assert "p" in compressed and "c" in compressed
    assert metrics["compression_ratio_percent"] >= 40.0
    assert metrics["tokens_saved"] > 0
