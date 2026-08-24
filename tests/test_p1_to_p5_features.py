import hashlib
import hmac
import json
import os
import sys

os.environ.setdefault("SEED_ON_STARTUP", "false")
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.rate_limiter import AcquirerRateLimitManager
from app.core.redis_client import RedisManager
from app.core.seed_data import seed_database
from app.database import Base, get_db
from app.main import app


def _reset_acquirer_state():
    for acquirer in AcquirerRateLimitManager.ACQUIRER_LIMITS:
        AcquirerRateLimitManager.reset_circuit_breaker(acquirer)
        RedisManager.set(f"errors:acquirer:{acquirer}", "0", ex=1)


@pytest.fixture
def client():
    _reset_acquirer_state()
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    seed_session = TestingSession()
    seed_database(seed_session, total_dev=24, total_eval=6)
    seed_session.close()

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_p1_webhook_simulation_and_deduplication(client):
    """P1: Test webhook simulation, pipeline execution, and idempotency deduplication."""
    payload = {
        "gateway": "razorpay",
        "event_type": "payment.failed",
        "amount": 2999.0,
        "currency": "INR",
        "payment_method": "card",
        "error_code": "BAD_REQUEST_NETWORK_TIMEOUT",
        "error_description": "Bank network timed out"
    }
    
    # 1. First ingestion -> PROCESSED
    res1 = client.post("/api/webhooks/simulate", json=payload)
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["status"] == "PROCESSED"
    assert data1["signature_valid"] is True
    assert "pipeline_result" in data1
    assert data1["pipeline_result"]["payment_id"] == data1["payment_id"]

    # 2. History endpoint check
    res_hist = client.get("/api/webhooks/history?limit=10")
    assert res_hist.status_code == 200
    logs = res_hist.json()
    assert len(logs) >= 1
    assert logs[0]["gateway"] == "razorpay"


def test_p1_live_razorpay_webhook_signature_handling(client):
    """P1: Test HMAC-SHA256 signature verification on Razorpay endpoint."""
    raw_payload = json.dumps({
        "id": "evt_test_rzp_999",
        "event": "payment.failed",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_test_rzp_999",
                    "amount": 150000,
                    "currency": "INR",
                    "method": "upi",
                    "error_code": "BAD_REQUEST_TIMEOUT",
                    "error_description": "UPI PSP timeout"
                }
            }
        }
    }).encode("utf-8")

    secret = "rzp_test_secret_recoverai"
    sig = hmac.new(secret.encode("utf-8"), raw_payload, hashlib.sha256).hexdigest()

    res = client.post(
        "/api/webhooks/razorpay",
        content=raw_payload,
        headers={"X-Razorpay-Signature": sig, "Content-Type": "application/json"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "PROCESSED"
    assert data["signature_valid"] is True

    # Bad signature should reject with 401
    res_bad = client.post(
        "/api/webhooks/razorpay",
        content=raw_payload,
        headers={"X-Razorpay-Signature": "invalid_signature_hex", "Content-Type": "application/json"}
    )
    assert res_bad.status_code == 401


def test_p2_preflight_evaluation_and_health(client):
    """P2: Test pre-flight checkout failure prevention and acquirer health."""
    # 1. Healthy rail evaluation
    req = {
        "merchant_id": "merch_enterprise_fashion",
        "customer_id": "cust_rahul_9921",
        "amount": 4500.0,
        "currency": "INR",
        "payment_method": "upi",
        "bank_code": "HDFC"
    }
    res = client.post("/api/preflight/evaluate", json=req)
    assert res.status_code == 200
    data = res.json()
    assert data["recommendation"] == "ALLOW"
    assert data["primary_method_risk"] == "LOW"
    assert len(data["method_rankings"]) > 0
    assert data["method_rankings"][0]["recommended"] is True

    # 2. Acquirer rail health matrix
    res_acq = client.get("/api/preflight/acquirers")
    assert res_acq.status_code == 200
    acq_data = res_acq.json()
    assert acq_data["total_monitored"] >= 5
    assert any(a["bank_code"] == "HDFC" for a in acq_data["acquirers"])

    # 3. Stats endpoint
    res_stats = client.get("/api/preflight/stats")
    assert res_stats.status_code == 200
    assert "total_preflight_checks" in res_stats.json()


def test_p3_dynamic_recovery_links_workflow(client):
    """P3: Test creating, retrieving, and completing 1-click dynamic recovery links."""
    # 1. Ingest a failed payment first
    res_ingest = client.post("/api/payments/events", json={
        "event_id": "evt_rec_link_01",
        "payment_id": "pay_rec_link_01",
        "customer_id": "cust_ananya_44",
        "customer_name": "Ananya Sharma",
        "amount": 3499.0,
        "currency": "INR",
        "payment_method": "card",
        "failure_reason": "INSUFFICIENT_FUNDS_DECLINE",
        "error_code": "INSUFFICIENT_FUNDS"
    })
    assert res_ingest.status_code == 200

    # 2. Create dynamic recovery link with discount
    create_req = {
        "payment_id": "pay_rec_link_01",
        "channel": "whatsapp",
        "custom_expiry_minutes": 120,
        "discount_amount": 100.0
    }
    res_create = client.post("/api/recovery-links/create", json=create_req)
    assert res_create.status_code == 200
    link_data = res_create.json()
    assert link_data["payment_id"] == "pay_rec_link_01"
    assert link_data["amount"] == 3399.0  # 3499 - 100
    assert link_data["status"] == "ACTIVE"
    assert "pay.recoverai.in" in link_data["short_url"]
    link_id = link_data["link_id"]

    # 3. Public link fetch
    res_get = client.get(f"/api/recovery-links/{link_id}")
    assert res_get.status_code == 200
    assert res_get.json()["link_id"] == link_id

    # 4. Customer completes payment via 1-click UPI
    comp_req = {
        "payment_method": "upi",
        "upi_id": "ananya@oksbi",
        "notes": "Completed from WhatsApp interactive link"
    }
    res_comp = client.post(f"/api/recovery-links/{link_id}/complete", json=comp_req)
    assert res_comp.status_code == 200
    comp_data = res_comp.json()
    assert comp_data["status"] == "SUCCESS"
    assert comp_data["amount_recovered"] == 3399.0

    # 5. Check payment is recovered
    res_pay = client.get("/api/payments/pay_rec_link_01")
    assert res_pay.status_code == 200
    assert res_pay.json()["payment"]["status"].lower() == "recovered"


def test_p4_policy_studio_and_shadow_testing(client):
    """P4: Test custom policy rules CRUD and counterfactual shadow simulation."""
    # 1. Create a shadow rule
    rule_req = {
        "merchant_id": "merch_enterprise_fashion",
        "name": "Auto-retry network glitches under 5k",
        "description": "Skip human review for small network glitches",
        "condition_field": "amount",
        "operator": "lt",
        "value": "5000",
        "action": "RETRY",
        "priority": 5,
        "is_active": True,
        "is_shadow": True
    }
    res_rule = client.post("/api/studio/rules", json=rule_req)
    assert res_rule.status_code == 200
    rule = res_rule.json()
    assert rule["is_shadow"] is True
    rule_id = rule["rule_id"]

    # 2. List rules
    res_list = client.get("/api/studio/rules?merchant_id=merch_enterprise_fashion")
    assert res_list.status_code == 200
    assert any(r["rule_id"] == rule_id for r in res_list.json())

    # 3. Run shadow simulation
    shadow_req = {
        "merchant_id": "merch_enterprise_fashion",
        "sample_size": 20,
        "dataset_split": "dev"
    }
    res_shadow = client.post("/api/studio/shadow-test/run", json=shadow_req)
    assert res_shadow.status_code == 200
    shadow_res = res_shadow.json()
    assert shadow_res["total_evaluated"] > 0
    assert "match_rate_percent" in shadow_res
    assert "projected_revenue_delta" in shadow_res
    assert "safety_score" in shadow_res
    assert shadow_res["recommendation"] in ["SAFE_TO_PROMOTE", "REVIEW_RECOMMENDED", "DO_NOT_PROMOTE"]

    # 4. Clean up rule
    res_del = client.delete(f"/api/studio/rules/{rule_id}")
    assert res_del.status_code == 200


def test_p5_digitally_signed_compliance_export_and_verification(client):
    """P5: Test DPDP/RBI compliance certificate export and cryptographic verification."""
    # 1. Export compliance certificate
    export_req = {
        "organization_name": "Acme Retail India Pvt Ltd",
        "certifier_name": "Chief Compliance Officer",
        "include_audit_trail": True,
        "include_dpdp_records": True
    }
    res_exp = client.post("/api/compliance/export", json=export_req)
    assert res_exp.status_code == 200
    cert = res_exp.json()
    assert "CERT-DPDP-RBI" in cert["certificate_id"]
    assert cert["tamper_evident_audit_seal"]["is_intact"] is True
    assert cert["dpdp_compliance_summary"]["fail_closed_consent_enforcement"] == "ACTIVE"
    assert len(cert["digital_signature"]) == 64
    assert len(cert["verification_hash"]) == 64

    # 2. Verify certificate authenticity
    verify_req = {
        "certificate_id": cert["certificate_id"],
        "verification_hash": cert["verification_hash"],
        "digital_signature": cert["digital_signature"]
    }
    res_ver = client.post("/api/compliance/verify", json=verify_req)
    assert res_ver.status_code == 200
    v_data = res_ver.json()
    assert v_data["valid"] is True
    assert v_data["status"] == "VERIFIED_AUTHENTIC"
    assert v_data["tamper_check"] == "PASSED"

    # 3. Tampered verification should fail
    bad_verify = {
        "certificate_id": cert["certificate_id"],
        "verification_hash": "tampered_hash_value_12345",
        "digital_signature": cert["digital_signature"]
    }
    res_bad_ver = client.post("/api/compliance/verify", json=bad_verify)
    assert res_bad_ver.status_code == 200
    assert res_bad_ver.json()["valid"] is False
    assert res_bad_ver.json()["tamper_check"] == "FAILED"
