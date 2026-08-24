"""
Live Gateway Webhook Parser & Signature Verifier.
Supports:
- Razorpay Webhooks (HMAC-SHA256 over raw body)
- Stripe Webhooks (HMAC-SHA256 with timestamp verification)
"""
import hashlib
import hmac
import os
import time
from typing import Any


def verify_razorpay_signature(body_bytes: bytes, signature: str, secret: str | None = None) -> bool:
    """Verifies Razorpay X-Razorpay-Signature using HMAC SHA256."""
    expected_secret = secret or os.getenv("RAZORPAY_WEBHOOK_SECRET", "rzp_test_secret_recoverai")
    if not signature or not expected_secret:
        return False
    
    generated_sig = hmac.new(
        key=expected_secret.encode("utf-8"),
        msg=body_bytes,
        digestmod=hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(generated_sig.lower(), signature.strip().lower())


def verify_stripe_signature(body_bytes: bytes, signature_header: str, secret: str | None = None, tolerance_sec: int = 600) -> bool:
    """Verifies Stripe Stripe-Signature header (t=timestamp,v1=signature)."""
    expected_secret = secret or os.getenv("STRIPE_WEBHOOK_SECRET", "whsec_test_recoverai")
    if not signature_header or not expected_secret:
        return False

    parts = dict(pair.split("=", 1) for pair in signature_header.split(",") if "=" in pair)
    timestamp = parts.get("t")
    v1_sig = parts.get("v1")
    if not timestamp or not v1_sig:
        return False

    # Check timestamp freshness if tolerance specified
    try:
        ts_int = int(timestamp)
        if abs(time.time() - ts_int) > tolerance_sec:
            return False
    except ValueError:
        return False

    signed_payload = f"{timestamp}.".encode() + body_bytes
    generated_sig = hmac.new(
        key=expected_secret.encode("utf-8"),
        msg=signed_payload,
        digestmod=hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(generated_sig.lower(), v1_sig.strip().lower())


def parse_razorpay_event(event_dict: dict[str, Any]) -> dict[str, Any]:
    """Extracts unified recovery payload from Razorpay webhook payload."""
    event_type = event_dict.get("event", "payment.failed")
    payload = event_dict.get("payload", {})
    payment_entity = payload.get("payment", {}).get("entity", {})

    payment_id = payment_entity.get("id") or f"pay_rzp_{int(time.time()*1000)}"
    amount_paise = payment_entity.get("amount", 0)
    amount_inr = float(amount_paise) / 100.0 if amount_paise > 0 else 1000.0

    method = payment_entity.get("method", "card").lower()
    error_code = payment_entity.get("error_code") or "BAD_REQUEST_PAYMENT_FAILED"
    error_desc = payment_entity.get("error_description") or "Payment authorization failed at bank"
    
    email = payment_entity.get("email") or "customer@example.in"
    contact = payment_entity.get("contact") or "+919876543210"
    customer_id = payment_entity.get("customer_id") or f"cust_{payment_id[-8:]}"

    return {
        "event_id": event_dict.get("id") or f"evt_rzp_{int(time.time()*1000)}",
        "gateway": "razorpay",
        "event_type": event_type,
        "payment_id": payment_id,
        "customer_id": customer_id,
        "customer_name": payment_entity.get("notes", {}).get("customer_name", "Valued Customer"),
        "customer_email": email,
        "customer_phone": contact,
        "amount": amount_inr,
        "currency": payment_entity.get("currency", "INR"),
        "payment_method": method,
        "failure_reason": error_desc,
        "error_code": error_code,
        "customer_context": {
            "customer_id": customer_id,
            "has_messaging_consent": True,
            "risk_score": 0.12 if "fraud" not in error_code.lower() else 0.85,
            "past_successful_payments": 4,
            "past_failed_payments": 1,
            "tenure_months": 8,
            "lifetime_value": amount_inr * 3.5,
        },
        "metadata": {
            "gateway_raw_event": event_type,
            "acquirer": payment_entity.get("acquirer_data", {}).get("bank", "HDFC"),
            "order_id": payment_entity.get("order_id"),
        }
    }


def parse_stripe_event(event_dict: dict[str, Any]) -> dict[str, Any]:
    """Extracts unified recovery payload from Stripe webhook payload."""
    event_type = event_dict.get("type", "payment_intent.payment_failed")
    data_object = event_dict.get("data", {}).get("object", {})

    payment_id = data_object.get("id") or f"pi_{int(time.time()*1000)}"
    amount_cents = data_object.get("amount", 0)
    amount = float(amount_cents) / 100.0 if amount_cents > 0 else 50.0

    last_error = data_object.get("last_payment_error", {})
    error_code = last_error.get("code") or data_object.get("failure_code") or "card_declined"
    error_desc = last_error.get("message") or data_object.get("failure_message") or "Your card was declined."
    
    method_types = data_object.get("payment_method_types", ["card"])
    payment_method = method_types[0] if method_types else "card"
    if payment_method == "card":
        payment_method = "card"

    customer_id = data_object.get("customer") or f"cus_{payment_id[-8:]}"

    return {
        "event_id": event_dict.get("id") or f"evt_str_{int(time.time()*1000)}",
        "gateway": "stripe",
        "event_type": event_type,
        "payment_id": payment_id,
        "customer_id": customer_id,
        "customer_name": "International Customer",
        "customer_email": data_object.get("receipt_email") or "shopper@global.com",
        "customer_phone": "+14155552671",
        "amount": amount,
        "currency": data_object.get("currency", "inr").upper(),
        "payment_method": payment_method,
        "failure_reason": error_desc,
        "error_code": error_code,
        "customer_context": {
            "customer_id": customer_id,
            "has_messaging_consent": True,
            "risk_score": 0.08,
            "past_successful_payments": 6,
            "past_failed_payments": 0,
            "tenure_months": 12,
            "lifetime_value": amount * 5.0,
        },
        "metadata": {
            "gateway_raw_event": event_type,
            "decline_code": last_error.get("decline_code", "generic_decline"),
        }
    }
