import time
from typing import Dict, Any, Tuple
from .redis_client import RedisManager

class AcquirerRateLimitManager:
    """
    Acquirer Bank Gateway Rate-Limiting & Circuit Breaker with Redis State Store.
    Protects downstream partner banks (HDFC, ICICI, SBI, Axis) and NPCI switches
    from burst retry storms and cascade failure.
    """

    # Acquirer threshold configurations (requests per minute)
    ACQUIRER_LIMITS = {
        "HDFC": {"max_rpm": 60, "error_spike_threshold": 0.35},
        "ICICI": {"max_rpm": 50, "error_spike_threshold": 0.30},
        "SBI": {"max_rpm": 30, "error_spike_threshold": 0.40},
        "AXIS": {"max_rpm": 45, "error_spike_threshold": 0.35},
        "NPCI_UPI": {"max_rpm": 120, "error_spike_threshold": 0.25}
    }

    @classmethod
    def check_acquirer_capacity(cls, payment_method: str, error_code: str = "") -> Tuple[bool, Dict[str, Any]]:
        """
        Check if the target acquirer bank has capacity or if circuit breaker is open.
        """
        # Determine target acquirer
        acquirer = "NPCI_UPI" if payment_method.lower() == "upi" else "HDFC"
        if "SBI" in error_code:
            acquirer = "SBI"
        elif "ICICI" in error_code:
            acquirer = "ICICI"

        config = cls.ACQUIRER_LIMITS.get(acquirer, {"max_rpm": 50, "error_spike_threshold": 0.35})
        max_rpm = config["max_rpm"]

        # Check circuit breaker state in Redis
        is_open = RedisManager.get(f"circuit:acquirer:{acquirer}:is_open")
        if is_open == "true":
            return False, {
                "acquirer": acquirer,
                "status": "CIRCUIT_BREAKER_OPEN",
                "reason": f"Acquirer {acquirer} circuit breaker tripped due to high bank failure velocity. Retries paused.",
                "recommended_action": "DELAYED_RETRY",
                "retry_after_sec": 30
            }

        # Check rate limits via Redis sliding counter
        current_minute = int(time.time() // 60)
        counter_key = f"rate:acquirer:{acquirer}:{current_minute}"
        current_count = RedisManager.incr(counter_key, ex=90)

        if current_count > max_rpm:
            return False, {
                "acquirer": acquirer,
                "status": "RATE_LIMIT_EXCEEDED",
                "reason": f"Partner Bank {acquirer} capacity saturated ({current_count}/{max_rpm} rpm). Throttling automated retries to prevent gateway ban.",
                "recommended_action": "DELAYED_RETRY",
                "retry_after_sec": 20
            }

        return True, {
            "acquirer": acquirer,
            "status": "HEALTHY",
            "current_rpm": current_count,
            "max_rpm": max_rpm,
            "utilization_percent": round((current_count / max_rpm) * 100, 1)
        }

    @classmethod
    def trip_circuit_breaker(cls, acquirer: str, duration_sec: int = 45):
        RedisManager.set(f"circuit:acquirer:{acquirer}:is_open", "true", ex=duration_sec)
