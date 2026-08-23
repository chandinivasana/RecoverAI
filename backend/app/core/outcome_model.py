"""
Seeded generative model of latent payment recoverability.

This is the single source of ground truth for the synthetic benchmark. It exists so
that the planner's `recovery_probability` is a genuine *prediction of an external
quantity* rather than the quantity itself:

- `assign_ground_truth()` draws, per payment, whether the payment is latently
  recoverable at all — from a distribution conditioned ONLY on seed-time facts
  (failure category, amount, customer signals). The planner never sees this.
- `simulate_action_outcome()` decides whether a specific approved action recovers
  a latently-recoverable payment, using a per-(failure, action) effectiveness table.

Both are pure and reproducible: RNG streams are keyed by string seeds
(`random.Random(str)` seeds via SHA-512 in CPython — deterministic across
processes, unlike tuple seeds which go through randomized `hash()`).

Disclosure: outcomes produced by this module are SYNTHETIC. Evaluation results
computed against them measure decision quality within a disclosed generative
model, not production recovery performance.
"""
import random
from typing import Any

from ..models import FailureCategory, RecoveryAction

# Namespace for the ground-truth RNG streams. Independent of the seeder's
# dataset stream (random.seed(42)) and of anything the planner computes.
GT_SEED = 20260823

# P(payment is recoverable at all | failure category), before adjustments.
BASE_RECOVERABILITY = {
    FailureCategory.TEMPORARY_NETWORK_FAILURE.value: 0.78,
    FailureCategory.INSUFFICIENT_FUNDS.value: 0.52,
    FailureCategory.PAYMENT_METHOD_FAILURE.value: 0.60,
    FailureCategory.CHECKOUT_ABANDONMENT.value: 0.38,
    FailureCategory.HIGH_RISK.value: 0.08,
    FailureCategory.UNKNOWN.value: 0.30,
}

# P(action recovers the payment | payment is latently recoverable).
# Mismatched (failure, action) pairs fall back to DEFAULT_EFFECTIVENESS.
ACTION_EFFECTIVENESS = {
    (FailureCategory.TEMPORARY_NETWORK_FAILURE.value, RecoveryAction.RETRY.value): 0.95,
    (FailureCategory.TEMPORARY_NETWORK_FAILURE.value, RecoveryAction.DELAYED_RETRY.value): 0.90,
    (FailureCategory.TEMPORARY_NETWORK_FAILURE.value, RecoveryAction.ALTERNATE_METHOD.value): 0.80,
    (FailureCategory.TEMPORARY_NETWORK_FAILURE.value, RecoveryAction.PAYMENT_LINK.value): 0.70,
    (FailureCategory.INSUFFICIENT_FUNDS.value, RecoveryAction.DELAYED_RETRY.value): 0.85,
    (FailureCategory.INSUFFICIENT_FUNDS.value, RecoveryAction.PAYMENT_LINK.value): 0.80,
    (FailureCategory.INSUFFICIENT_FUNDS.value, RecoveryAction.ALTERNATE_METHOD.value): 0.60,
    (FailureCategory.INSUFFICIENT_FUNDS.value, RecoveryAction.RETRY.value): 0.35,
    (FailureCategory.PAYMENT_METHOD_FAILURE.value, RecoveryAction.ALTERNATE_METHOD.value): 0.92,
    (FailureCategory.PAYMENT_METHOD_FAILURE.value, RecoveryAction.PAYMENT_LINK.value): 0.75,
    (FailureCategory.PAYMENT_METHOD_FAILURE.value, RecoveryAction.RETRY.value): 0.15,
    (FailureCategory.PAYMENT_METHOD_FAILURE.value, RecoveryAction.DELAYED_RETRY.value): 0.20,
    (FailureCategory.CHECKOUT_ABANDONMENT.value, RecoveryAction.PAYMENT_LINK.value): 0.90,
    (FailureCategory.CHECKOUT_ABANDONMENT.value, RecoveryAction.ALTERNATE_METHOD.value): 0.65,
    (FailureCategory.CHECKOUT_ABANDONMENT.value, RecoveryAction.RETRY.value): 0.30,
    (FailureCategory.CHECKOUT_ABANDONMENT.value, RecoveryAction.DELAYED_RETRY.value): 0.35,
    (FailureCategory.HIGH_RISK.value, RecoveryAction.RETRY.value): 0.40,
}
DEFAULT_EFFECTIVENESS = 0.55

# Actions that never settle money directly (they hand off, not recover).
NON_MONETARY_ACTIONS = frozenset({RecoveryAction.HUMAN_REVIEW.value, RecoveryAction.STOP.value})


def latent_recovery_prob(failure_category: str, amount: float, meta: dict[str, Any]) -> float:
    """Latent P(recoverable) from seed-time facts only — never from planner output."""
    p = BASE_RECOVERABILITY.get(failure_category, BASE_RECOVERABILITY[FailureCategory.UNKNOWN.value])
    p *= 1.0 - min(0.30, float(amount) / 500_000.0)  # big tickets recover less often
    past_success = float(meta.get("past_successful_payments", 3) or 0)
    p *= 0.75 + 0.5 * min(1.0, past_success / 10.0)  # customer propensity
    p *= 1.0 - 0.4 * float(meta.get("risk_score", 0.1) or 0.0)
    if not meta.get("has_messaging_consent", True):
        p *= 0.85  # nudge channels unavailable
    return round(min(0.97, max(0.02, p)), 4)


def assign_ground_truth(
    payment_id: str, failure_category: str, amount: float, meta: dict[str, Any]
) -> tuple[bool, float, int]:
    """
    Returns (recoverable, latent_probability, outcome_seed) for one payment.
    Deterministic per payment_id; independent of the planner and the dataset RNG.
    """
    rng = random.Random(f"{GT_SEED}:{payment_id}")
    p = latent_recovery_prob(failure_category, amount, meta)
    return rng.random() < p, p, rng.randrange(2**31)


def simulate_action_outcome(
    recoverable: bool, outcome_seed: int, action: str, failure_category: str
) -> bool:
    """
    Whether `action` recovers the payment. Pure and reproducible: the same
    (payment, action) pair always yields the same outcome; no DB, clock, or
    global RNG involved. Non-monetary actions never settle money themselves.
    """
    if action in NON_MONETARY_ACTIONS:
        return False
    if not recoverable:
        return False
    effectiveness = ACTION_EFFECTIVENESS.get((failure_category, action), DEFAULT_EFFECTIVENESS)
    rng = random.Random(f"{outcome_seed}:{action}")
    return rng.random() < effectiveness
