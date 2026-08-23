import time
from typing import Any

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

    # Failed executions per acquirer within the 60s error window that trip the breaker.
    ERROR_TRIP_THRESHOLD = 5

    @classmethod
    def resolve_acquirer(cls, payment_method: str, error_code: str = "") -> str:
        acquirer = "NPCI_UPI" if payment_method.lower() == "upi" else "HDFC"
        if "SBI" in error_code:
            acquirer = "SBI"
        elif "ICICI" in error_code:
            acquirer = "ICICI"
        return acquirer

    @classmethod
    def check_acquirer_capacity(cls, payment_method: str, error_code: str = "", dry_run: bool = False) -> tuple[bool, dict[str, Any]]:
        """
        Check if the target acquirer bank has capacity or if circuit breaker is open.

        dry_run=True is for read-only passes (benchmark, what-if simulation,
        replay): they evaluate against CONFIGURED limits only and neither read
        nor mutate live transient state (breaker flags, sliding counters), so
        offline results stay deterministic and never consume live capacity.
        """
        acquirer = cls.resolve_acquirer(payment_method, error_code)
        config = cls.ACQUIRER_LIMITS.get(acquirer, {"max_rpm": 50, "error_spike_threshold": 0.35})
        max_rpm = config["max_rpm"]

        if dry_run:
            return True, {
                "acquirer": acquirer,
                "status": "HEALTHY_DRY_RUN",
                "current_rpm": 0,
                "max_rpm": max_rpm,
                "utilization_percent": 0.0,
                "note": "Offline evaluation: live breaker/counter state intentionally not consulted."
            }

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

    @classmethod
    def reset_circuit_breaker(cls, acquirer: str):
        RedisManager.set(f"circuit:acquirer:{acquirer}:is_open", "false", ex=1)

    @classmethod
    def register_acquirer_failure(cls, payment_method: str, error_code: str = "") -> dict[str, Any]:
        """
        Records one failed execution against the target acquirer. When failures
        within the 60s window reach ERROR_TRIP_THRESHOLD, the circuit breaker
        trips (pausing direct retries for 45s). This is the live path that
        actually opens the breaker — capacity checks only ever read it.
        """
        acquirer = cls.resolve_acquirer(payment_method, error_code)
        failures = RedisManager.incr(f"errors:acquirer:{acquirer}", ex=60)
        tripped = failures >= cls.ERROR_TRIP_THRESHOLD
        if tripped:
            cls.trip_circuit_breaker(acquirer)
        return {
            "acquirer": acquirer,
            "recent_failures": failures,
            "trip_threshold": cls.ERROR_TRIP_THRESHOLD,
            "circuit_breaker_tripped": tripped
        }
