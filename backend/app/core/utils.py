"""Small shared helpers used across API routers (single source of truth —
these were previously copy-pasted per router)."""
import ast
import json
from typing import Any, Dict


def safe_json_loads(val: Any) -> Dict[str, Any]:
    if not val:
        return {}
    if isinstance(val, dict):
        return val
    try:
        return json.loads(val)
    except Exception:
        try:
            return ast.literal_eval(val)
        except Exception:
            return {"raw": str(val)}


# Deterministic demo-tenant assignment by ticket size. Every payment belongs to
# exactly one merchant so multi-tenant filtering is real, not cosmetic.
MERCHANT_TIERS = [
    (10_000.0, "merch_swiggy_ind"),   # quick-commerce small tickets
    (50_000.0, "merch_urban_comp"),   # services / subscriptions mid tickets
]
DEFAULT_HIGH_TIER_MERCHANT = "merch_tata_lux"  # high-ticket retail


def merchant_for_amount(amount: float) -> str:
    for threshold, merchant_id in MERCHANT_TIERS:
        if amount < threshold:
            return merchant_id
    return DEFAULT_HIGH_TIER_MERCHANT
