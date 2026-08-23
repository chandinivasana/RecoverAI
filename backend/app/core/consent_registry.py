from typing import Dict, Any
from datetime import datetime

class DPDPConsentRegistry:
    """
    Digital Personal Data Protection (DPDP) Act Compliance Registry.
    Tracks explicit merchant customer messaging and payment recovery consent.

    Fail-closed semantics:
    - An explicit opt-out record blocks messaging (allowed=False).
    - An explicit opt-in record permits messaging (allowed=True).
    - NO record on file returns allowed=None — the caller must then require
      explicit consent from the transaction context; absence of any consent
      signal blocks messaging. Unknown is never treated as consent.

    Note: this registry is an in-memory demo store (per-process, non-persistent).
    The durable consent signal for seeded data lives in each payment's
    metadata (`has_messaging_consent`), which PolicyRules checks as well.
    """

    # In-memory / fast-lookup registry for customer consent status
    _REGISTRY: Dict[str, Dict[str, Any]] = {}

    @classmethod
    def register_consent(cls, customer_id: str, channel: str = "all", granted: bool = True, source: str = "checkout_optin") -> Dict[str, Any]:
        record = {
            "customer_id": customer_id,
            "channel": channel,
            "granted": granted,
            "source": source,
            "dpdp_compliant": True,
            "timestamp": datetime.utcnow().isoformat(),
            "retention_period_days": 180
        }
        cls._REGISTRY[customer_id] = record
        return record

    @classmethod
    def check_consent(cls, customer_id: str, channel: str = "whatsapp") -> Dict[str, Any]:
        """
        Verify if customer has valid DPDP-compliant communication consent.
        Returns allowed=True (opt-in on file), allowed=False (opt-out on file),
        or allowed=None (no record — caller must fail closed).
        """
        if not customer_id:
            return {"allowed": False, "reason": "No customer ID provided for DPDP consent verification."}

        record = cls._REGISTRY.get(customer_id)
        if not record:
            return {
                "allowed": None,
                "reason": (
                    "No DPDP consent record on file for this customer. "
                    "Explicit transaction-context consent is required (fail-closed)."
                )
            }

        if not record.get("granted", False):
            return {
                "allowed": False,
                "reason": f"DPDP Compliance Violation: Customer '{customer_id}' has explicitly opted out of automated recovery notifications ({record.get('source')})."
            }

        return {
            "allowed": True,
            "reason": f"DPDP Compliance Verified: Consent granted via {record.get('source')}.",
            "granted_at": record.get("timestamp")
        }


# Backwards-compatible alias for the previous (typo'd) class name.
DPDPairConsentRegistry = DPDPConsentRegistry
