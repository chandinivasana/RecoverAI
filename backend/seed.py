import os
import sys
import json
import random
from datetime import datetime, timedelta
import scipy.stats as stats

# Ensure app is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), ".")))

from app.database import engine, Base, SessionLocal
from app.models import (
    DBPayment, DBPaymentEvent, DBPolicyConfig, DBRecoveryDecision,
    DBRecoveryExecution, DBHumanReview, DBAuditEvent,
    PaymentStatus, RecoveryAction, RiskLevel
)
from app.core.consent_registry import DPDPairConsentRegistry

def run_seed():
    print("🌱 Initializing PostgreSQL / SQLite database schema...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # Clear existing data
    db.query(DBAuditEvent).delete()
    db.query(DBHumanReview).delete()
    db.query(DBRecoveryExecution).delete()
    db.query(DBRecoveryDecision).delete()
    db.query(DBPaymentEvent).delete()
    db.query(DBPayment).delete()
    db.query(DBPolicyConfig).delete()
    db.commit()

    print("🔧 Seeding Policy Configuration...")
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

    print("📊 Generating 1,000 realistic Indian merchant payment failures...")
    merchants = ["merch_swiggy_ind", "merch_urban_comp", "merch_tata_lux"]
    customer_names = [
        "Aarav Sharma", "Priya Patel", "Vikram Malhotra", "Ananya Deshmukh",
        "Rohan Gupta", "Deepa Nair", "Karan Mehra", "Pooja Hegde",
        "Siddharth Verma", "Neha Reddy", "Aditya Joshi", "Ishaan Roy",
        "Kavita Iyer", "Ramesh Chawla", "Sunita Rao", "Gaurav Bansal"
    ]

    error_catalog = [
        {"code": "GATEWAY_TIMEOUT", "reason": "Bank network timeout during UPI PIN authorization", "method": "upi", "prob": 0.85},
        {"code": "BANK_NETWORK_DOWN", "reason": "Issuing bank switch unresponsive", "method": "upi", "prob": 0.75},
        {"code": "INSUFFICIENT_FUNDS", "reason": "Debit card declined: Account balance insufficient", "method": "card", "prob": 0.55},
        {"code": "CARD_EXPIRED", "reason": "Card expired / invalid CVV validation failure", "method": "card", "prob": 0.70},
        {"code": "USER_CANCELLED", "reason": "Customer abandoned checkout on 3DS OTP screen", "method": "netbanking", "prob": 0.50},
        {"code": "FRAUD_SUSPECTED", "reason": "Velocity risk: unusual transaction pattern flagged", "method": "card", "prob": 0.05}
    ]

    random.seed(42)
    now = datetime.utcnow()

    # Generate 1,000 transactions (800 dev / 200 eval)
    for i in range(1000):
        is_eval = i >= 800
        split = "eval" if is_eval else "dev"
        payment_id = f"pay_seed_{i+1:04d}"
        event_id = f"evt_seed_{i+1:04d}"
        
        customer_name = random.choice(customer_names)
        customer_id = f"cust_{abs(hash(customer_name)) % 1000:03d}"
        err_item = random.choice(error_catalog)
        merchant_id = random.choice(merchants)

        # Ticket size distributions
        if merchant_id == "merch_tata_lux":
            amount = round(random.uniform(25000.0, 250000.0), 2)
        elif merchant_id == "merch_urban_comp":
            amount = round(random.uniform(1500.0, 24000.0), 2)
        else:
            amount = round(random.uniform(250.0, 4500.0), 2)

        risk_score = 0.85 if err_item["code"] == "FRAUD_SUSPECTED" else round(random.uniform(0.02, 0.25), 2)
        created_time = now - timedelta(days=random.randint(0, 14), hours=random.randint(0, 23), minutes=random.randint(0, 59))

        # Register DPDP consent
        has_consent = random.random() > 0.10
        DPDPairConsentRegistry.register_consent(customer_id, granted=has_consent, source="checkout_optin")

        cust_meta = {
            "past_successful_payments": random.randint(2, 25),
            "past_failed_payments": random.randint(0, 2),
            "risk_score": risk_score,
            "has_messaging_consent": has_consent,
            "merchant_id": merchant_id,
            "dataset_split": split
        }

        # Simulated outcome
        is_recovered = False
        amount_recovered = 0.0
        status = PaymentStatus.FAILED.value

        if amount <= 25000 and risk_score < 0.70:
            if random.random() < err_item["prob"]:
                is_recovered = True
                amount_recovered = amount
                status = PaymentStatus.RECOVERED.value
        elif amount > 25000 or risk_score >= 0.70:
            status = PaymentStatus.ESCALATED_TO_HUMAN.value

        payment = DBPayment(
            payment_id=payment_id,
            customer_id=customer_id,
            customer_name=customer_name,
            customer_email=f"{customer_name.lower().replace(' ', '.')}@example.com",
            customer_phone="+919876543210",
            amount=amount,
            currency="INR",
            payment_method=err_item["method"],
            status=status,
            failure_reason=err_item["reason"],
            error_code=err_item["code"],
            retry_count=1 if is_recovered else 0,
            amount_recovered=amount_recovered,
            risk_score=risk_score,
            dataset_split=split,
            metadata_json=json.dumps(cust_meta),
            created_at=created_time,
            updated_at=created_time
        )
        db.add(payment)

        # Ingestion Event
        event = DBPaymentEvent(
            event_id=event_id,
            payment_id=payment_id,
            event_type="payment.failed",
            payload_json=json.dumps({"amount": amount, "error_code": err_item["code"]}),
            created_at=created_time
        )
        db.add(event)

        # Audit Event
        audit = DBAuditEvent(
            audit_id=f"aud_seed_{i+1:04d}",
            payment_id=payment_id,
            event_type="PAYMENT_INGESTION",
            actor="PaymentIngestService",
            metadata_json=json.dumps({"status": status, "amount": amount}),
            timestamp=created_time
        )
        db.add(audit)

        # If escalated, add to human review queue
        if status == PaymentStatus.ESCALATED_TO_HUMAN.value and i < 30:
            review = DBHumanReview(
                review_id=f"rev_seed_{i+1:04d}",
                payment_id=payment_id,
                decision_id=f"dec_seed_{i+1:04d}",
                amount=amount,
                status="PENDING",
                reason=f"Transaction amount ₹{amount:,.2f} exceeds autonomous limit of ₹25,000.00.",
                risk_level=RiskLevel.HIGH.value if risk_score >= 0.70 else RiskLevel.LOW.value,
                proposed_action="DELAYED_RETRY",
                created_at=created_time
            )
            db.add(review)

    db.commit()

    # Compute A/B statistical significance via SciPy
    print("📈 Computing A/B Testing Statistical Significance via SciPy...")
    # EXP-042: Variant A (74/175), Variant B (138/175)
    obs = [[74, 175 - 74], [138, 175 - 138]]
    chi2, p_val, dof, ex = stats.chi2_contingency(obs)
    print(f"   EXP-042 (UPI Delayed Retry): Chi2 = {chi2:.4f}, p-value = {p_val:.6f} (Statistically Significant)")

    # EXP-043: Variant A (38/120), Variant B (79/120)
    obs2 = [[38, 120 - 38], [79, 120 - 79]]
    chi2_2, p_val_2, dof_2, ex_2 = stats.chi2_contingency(obs2)
    print(f"   EXP-043 (Alternate Rail Nudge): Chi2 = {chi2_2:.4f}, p-value = {p_val_2:.6f} (Statistically Significant)")

    total_count = db.query(DBPayment).count()
    recovered_count = db.query(DBPayment).filter(DBPayment.status == PaymentStatus.RECOVERED.value).count()
    print(f"✅ Successfully seeded {total_count} transactions ({recovered_count} recovered) in database.")
    db.close()

if __name__ == "__main__":
    run_seed()
