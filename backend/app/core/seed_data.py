import json
import random
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from ..models import DBPayment, DBPaymentEvent, DBPolicyConfig, FailureCategory, PaymentStatus
from .outcome_model import assign_ground_truth
from .utils import merchant_for_amount

INDIAN_NAMES = [
    "Aarav Sharma", "Priya Patel", "Rohan Mehta", "Ananya Iyer", "Vikram Reddy",
    "Neha Gupta", "Aditya Verma", "Kavita Rao", "Siddharth Nair", "Pooja Deshmukh",
    "Rajesh Kumar", "Sunita Joshi", "Amit Singhal", "Sneha Roy", "Karan Kapoor",
    "Deepa Menon", "Vivek Choudhury", "Meera Sen", "Manish Bansal", "Ritu Agrawal"
]

FAILURE_SCENARIOS = [
    {
        "failure_reason": "Bank network timeout during UPI PIN authorization",
        "error_code": "GATEWAY_TIMEOUT",
        "method": "upi",
        "category": FailureCategory.TEMPORARY_NETWORK_FAILURE,
        "amount_range": (300, 8000),
        "risk_range": (0.02, 0.15)
    },
    {
        "failure_reason": "Issuing bank server unresponsive during 3DS OTP validation",
        "error_code": "BANK_NETWORK_DOWN",
        "method": "card",
        "category": FailureCategory.TEMPORARY_NETWORK_FAILURE,
        "amount_range": (1200, 18000),
        "risk_range": (0.05, 0.20)
    },
    {
        "failure_reason": "Insufficient account balance at time of debit",
        "error_code": "INSUFFICIENT_FUNDS",
        "method": "upi",
        "category": FailureCategory.INSUFFICIENT_FUNDS,
        "amount_range": (1500, 24000),
        "risk_range": (0.10, 0.35)
    },
    {
        "failure_reason": "Card daily debit transaction limit exceeded",
        "error_code": "LIMIT_EXCEEDED",
        "method": "card",
        "category": FailureCategory.INSUFFICIENT_FUNDS,
        "amount_range": (10000, 45000),
        "risk_range": (0.15, 0.40)
    },
    {
        "failure_reason": "Credit card expired or invalid expiry month/year",
        "error_code": "CARD_EXPIRED",
        "method": "card",
        "category": FailureCategory.PAYMENT_METHOD_FAILURE,
        "amount_range": (800, 15000),
        "risk_range": (0.05, 0.18)
    },
    {
        "failure_reason": "Virtual Payment Address (VPA) handle does not exist",
        "error_code": "VPA_INVALID",
        "method": "upi",
        "category": FailureCategory.PAYMENT_METHOD_FAILURE,
        "amount_range": (500, 6000),
        "risk_range": (0.08, 0.25)
    },
    {
        "failure_reason": "Customer clicked back button and dropped off payment screen",
        "error_code": "USER_CANCELLED",
        "method": "netbanking",
        "category": FailureCategory.CHECKOUT_ABANDONMENT,
        "amount_range": (2000, 35000),
        "risk_range": (0.05, 0.20)
    },
    {
        "failure_reason": "Unusual cross-border velocity and velocity spike detected",
        "error_code": "FRAUD_SUSPECTED",
        "method": "card",
        "category": FailureCategory.HIGH_RISK,
        "amount_range": (55000, 250000),
        "risk_range": (0.75, 0.98)
    },
    {
        "failure_reason": "High-value luxury order flagged for manual review",
        "error_code": "SUSPICIOUS_ACTIVITY",
        "method": "emi",
        "category": FailureCategory.HIGH_RISK,
        "amount_range": (85000, 450000),
        "risk_range": (0.80, 0.95)
    },
    {
        "failure_reason": "Unrecognized switch response code from legacy aggregator",
        "error_code": "UNKNOWN",
        "method": "netbanking",
        "category": FailureCategory.UNKNOWN,
        "amount_range": (4000, 22000),
        "risk_range": (0.25, 0.50)
    }
]

def seed_database(db: Session, total_dev: int = 800, total_eval: int = 200, force: bool = False):
    """
    Populates the database with 1,000 synthetic failed payment transactions (800 dev + 200 eval).
    """
    count = db.query(DBPayment).count()
    if count >= 1000 and not force:
        return

    # Initialize default policy config if not exists
    policy_config = db.query(DBPolicyConfig).first()
    if not policy_config:
        policy_config = DBPolicyConfig(
            max_autonomous_retry_attempts=2,
            max_autonomous_amount=25000.0,
            require_human_high_risk=True,
            stop_on_repeated_failure=True,
            require_customer_consent_for_nudge=True,
            escalate_unknown_failure=True,
            vulcan_enabled=True,
            updated_at=datetime.utcnow()
        )
        db.add(policy_config)
        db.commit()

    # Clear existing if force
    if force:
        db.query(DBPaymentEvent).delete()
        db.query(DBPayment).delete()
        db.commit()

    random.seed(42)  # For reproducibility

    # Generate records
    splits = [("dev", total_dev), ("eval", total_eval)]
    
    for split_name, total_count in splits:
        for i in range(total_count):
            scenario = random.choice(FAILURE_SCENARIOS)
            name = random.choice(INDIAN_NAMES)
            cust_id = f"cust_{random.randint(1000, 9999)}"
            pay_id = f"pay_{split_name}_{i+1:04d}"
            evt_id = f"evt_{split_name}_{i+1:04d}"
            
            # Generate amount
            min_amt, max_amt = scenario["amount_range"]
            amount = round(random.uniform(min_amt, max_amt), 2)
            
            # Special wow moment sample for demo
            if split_name == "dev" and i == 0:
                amount = 250000.00
                scenario = FAILURE_SCENARIOS[7]  # High risk
            elif split_name == "dev" and i == 1:
                amount = 3499.00
                scenario = FAILURE_SCENARIOS[0]  # Network failure

            min_risk, max_risk = scenario["risk_range"]
            risk_score = round(random.uniform(min_risk, max_risk), 2)

            past_successes = random.randint(1, 20) if risk_score < 0.5 else random.randint(0, 2)
            past_failures = random.randint(0, 3)
            tenure = random.randint(2, 36)

            meta = {
                "customer_name": name,
                "tenure_months": tenure,
                "lifetime_value": round(past_successes * amount * 0.8, 2),
                "past_successful_payments": past_successes,
                "past_failed_payments": past_failures,
                "preferred_payment_method": scenario["method"],
                "last_successful_payment_days_ago": random.randint(1, 30),
                "risk_score": risk_score,
                "has_messaging_consent": random.random() > 0.15
            }

            created_time = datetime.utcnow() - timedelta(days=random.randint(0, 14), minutes=random.randint(0, 1400))

            # Latent ground truth for the synthetic benchmark — drawn from an
            # independent RNG stream keyed per payment (see core/outcome_model.py).
            # The planner never sees these fields.
            gt_recoverable, gt_prob, outcome_seed = assign_ground_truth(
                pay_id, scenario["category"].value, amount, meta
            )

            payment = DBPayment(
                payment_id=pay_id,
                customer_id=cust_id,
                customer_name=name,
                customer_email=f"{name.lower().replace(' ', '.')}@example.in",
                customer_phone=f"+91 98{random.randint(10000000, 99999999)}",
                amount=amount,
                currency="INR",
                payment_method=scenario["method"],
                status=PaymentStatus.FAILED.value,
                failure_reason=scenario["failure_reason"],
                error_code=scenario["error_code"],
                retry_count=0,
                max_retries=2,
                amount_recovered=0.0,
                risk_score=risk_score,
                dataset_split=split_name,
                merchant_id=merchant_for_amount(amount),
                ground_truth_recoverable=gt_recoverable,
                ground_truth_prob=gt_prob,
                outcome_seed=outcome_seed,
                metadata_json=json.dumps(meta),
                created_at=created_time,
                updated_at=created_time
            )
            db.add(payment)

            # Add corresponding payment event
            event = DBPaymentEvent(
                event_id=evt_id,
                payment_id=pay_id,
                event_type="payment.failed",
                payload_json=json.dumps({
                    "payment_id": pay_id,
                    "amount": amount,
                    "reason": scenario["failure_reason"],
                    "error_code": scenario["error_code"]
                }),
                processed=False,
                created_at=created_time
            )
            db.add(event)

        db.commit()
