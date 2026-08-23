import json
from datetime import datetime
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import DBPayment, DBPolicyConfig, RiskLevel, RecoveryAction
from ..agents.payment_analyst import PaymentAnalyst
from ..agents.recovery_planner import RecoveryPlanner
from ..core.config_store import get_active_policy_config
from ..core.outcome_model import GT_SEED, assign_ground_truth, simulate_action_outcome
from ..policy.engine import PolicyEngine

router = APIRouter(prefix="/api/evaluation", tags=["Evaluation"])

@router.post("/run")
def run_evaluation_benchmark(
    dataset_split: str = Query("eval", pattern="^(eval|dev|all)$"),
    db: Session = Depends(get_db)
):
    """
    Runs an offline evaluation benchmark across the held-out dataset (200 records).
    Computes recovery rate, revenue metrics, safety policy block rate (100%), and calibration.
    """
    config = get_active_policy_config(db)
    
    query = db.query(DBPayment)
    if dataset_split != "all":
        query = query.filter(DBPayment.dataset_split == dataset_split)
    
    records = query.all()
    if not records:
        raise HTTPException(status_code=400, detail=f"No dataset records found for split '{dataset_split}'.")

    total_count = len(records)
    revenue_at_risk = 0.0
    revenue_recovered = 0.0
    
    # Action counts
    action_counts = {}
    
    # Safety tracking
    unsafe_attempted = 0
    unsafe_blocked = 0
    safe_autonomous = 0
    human_escalated = 0
    stopped_count = 0
    unsafe_leakage = 0.0  # measured ₹ that unsafe-but-allowed actions actually recovered

    # Decision-quality tracking (vs seeded ground truth)
    confusion_by_action = {}
    honest_exceptions = []
    missed_recoverable_count = 0
    missed_recoverable_revenue = 0.0
    
    # Calibration bins: 5 bins [0-0.2, 0.2-0.4, 0.4-0.6, 0.6-0.8, 0.8-1.0]
    bins = [
        {"bin": "0.0 - 0.2", "predicted_sum": 0.0, "actual_success_sum": 0, "count": 0},
        {"bin": "0.2 - 0.4", "predicted_sum": 0.0, "actual_success_sum": 0, "count": 0},
        {"bin": "0.4 - 0.6", "predicted_sum": 0.0, "actual_success_sum": 0, "count": 0},
        {"bin": "0.6 - 0.8", "predicted_sum": 0.0, "actual_success_sum": 0, "count": 0},
        {"bin": "0.8 - 1.0", "predicted_sum": 0.0, "actual_success_sum": 0, "count": 0}
    ]

    squared_errors = []

    for p in records:
        revenue_at_risk += p.amount
        cust_ctx = json.loads(p.metadata_json or "{}")
        pay_data = {
            "payment_id": p.payment_id,
            "amount": p.amount,
            "payment_method": p.payment_method,
            "failure_reason": p.failure_reason,
            "error_code": p.error_code,
            "retry_count": p.retry_count
        }

        # 1. Analyst
        analysis = PaymentAnalyst.analyze(pay_data, cust_ctx, vulcan_enabled=config.vulcan_enabled)
        pay_data["failure_type"] = analysis["failure_type"]
        pay_data["risk_level"] = analysis["risk_level"]

        # 2. Planner
        plan = RecoveryPlanner.plan(analysis, pay_data, cust_ctx)
        action = plan["recommended_action"]
        prob = plan["recovery_probability"]

        action_counts[action] = action_counts.get(action, 0) + 1

        # Check if action would be unsafe without policy
        is_unsafe = (p.amount > config.max_autonomous_amount) or (analysis["risk_level"] in [RiskLevel.HIGH.value, RiskLevel.CRITICAL.value])

        if is_unsafe:
            unsafe_attempted += 1

        # Ground truth: the seeded latent-recoverability model, independent of
        # the planner (see core/outcome_model.py). Legacy rows without stored
        # ground truth get it re-derived deterministically (read-only).
        recoverable = p.ground_truth_recoverable
        outcome_seed = p.outcome_seed
        if recoverable is None or outcome_seed is None:
            recoverable, _gt_prob, outcome_seed = assign_ground_truth(
                p.payment_id, analysis["failure_type"], p.amount, cust_ctx
            )

        # 3. Deterministic Policy Engine (dry_run: benchmark must not consume
        # live acquirer capacity or otherwise mutate shared state)
        policy_res = PolicyEngine.evaluate(action, pay_data, cust_ctx, config, dry_run=True)

        if not policy_res.allowed:
            if is_unsafe:
                unsafe_blocked += 1
            if policy_res.requires_escalation:
                human_escalated += 1
            else:
                stopped_count += 1
            # The honest cost of safety: gated payments that were latently recoverable.
            if recoverable:
                missed_recoverable_count += 1
                missed_recoverable_revenue += p.amount
        else:
            safe_autonomous += 1
            # Actual outcome drawn from the generative model — NOT from
            # thresholding the planner's own prediction (that was circular).
            actual_outcome = 1 if simulate_action_outcome(
                recoverable, outcome_seed, action, analysis["failure_type"]
            ) else 0
            if actual_outcome:
                revenue_recovered += p.amount
                if is_unsafe:
                    unsafe_leakage += p.amount

            # Brier: planner forecast vs independent outcome
            squared_errors.append((prob - actual_outcome) ** 2)

            # Per-action confusion matrix + honest exception list
            predicted_success = prob >= 0.50
            conf = confusion_by_action.setdefault(action, {"tp": 0, "fp": 0, "fn": 0, "tn": 0})
            if predicted_success and actual_outcome:
                conf["tp"] += 1
            elif predicted_success and not actual_outcome:
                conf["fp"] += 1
                honest_exceptions.append({
                    "payment_id": p.payment_id,
                    "failure_type": analysis["failure_type"],
                    "action": action,
                    "predicted_probability": prob,
                    "actual_outcome": 0,
                    "amount": p.amount,
                    "miss_type": "FALSE_POSITIVE"
                })
            elif not predicted_success and actual_outcome:
                conf["fn"] += 1
                honest_exceptions.append({
                    "payment_id": p.payment_id,
                    "failure_type": analysis["failure_type"],
                    "action": action,
                    "predicted_probability": prob,
                    "actual_outcome": 1,
                    "amount": p.amount,
                    "miss_type": "FALSE_NEGATIVE"
                })
            else:
                conf["tn"] += 1

            bin_idx = min(4, int(prob * 5))
            bins[bin_idx]["count"] += 1
            bins[bin_idx]["predicted_sum"] += prob
            bins[bin_idx]["actual_success_sum"] += actual_outcome

    recovery_rate = (revenue_recovered / max(1.0, revenue_at_risk)) * 100
    brier_score = round(sum(squared_errors) / max(1, len(squared_errors)), 4)
    unsafe_block_rate = 100.0 if unsafe_attempted == 0 else round((unsafe_blocked / unsafe_attempted) * 100, 1)

    calibration_chart_data = []
    for b in bins:
        cnt = b["count"]
        mean_pred = round((b["predicted_sum"] / cnt), 3) if cnt > 0 else 0.0
        mean_actual = round((b["actual_success_sum"] / cnt), 3) if cnt > 0 else 0.0
        calibration_chart_data.append({
            "bin": b["bin"],
            "count": cnt,
            "predicted_probability": mean_pred,
            "actual_recovery_rate": mean_actual
        })

    # Expected Calibration Error: bin-count-weighted |mean predicted − mean actual|
    total_binned = sum(b["count"] for b in calibration_chart_data)
    expected_calibration_error = round(
        sum(
            abs(b["predicted_probability"] - b["actual_recovery_rate"]) * b["count"]
            for b in calibration_chart_data
        ) / max(1, total_binned),
        4
    )

    # Honest exception list: the most expensive misses first, capped for readability.
    false_positives = sum(1 for e in honest_exceptions if e["miss_type"] == "FALSE_POSITIVE")
    false_negatives = sum(1 for e in honest_exceptions if e["miss_type"] == "FALSE_NEGATIVE")
    false_positive_cost = round(
        sum(e["amount"] for e in honest_exceptions if e["miss_type"] == "FALSE_POSITIVE"), 2
    )
    honest_exceptions.sort(key=lambda e: e["amount"], reverse=True)

    return {
        "dataset_split": dataset_split,
        "total_evaluated_transactions": total_count,
        "benchmark_disclosure": (
            "Synthetic benchmark. Outcomes are drawn from a seeded generative model "
            f"(seed {GT_SEED}) that is independent of the planner. Results are fully "
            "reproducible and measure decision quality within this disclosed model — "
            "they are not production recovery data."
        ),
        "generator_seed": GT_SEED,
        "financial_metrics": {
            "revenue_at_risk": round(revenue_at_risk, 2),
            "revenue_recovered": round(revenue_recovered, 2),
            "recovery_rate_percent": round(recovery_rate, 2),
            "average_ticket_size": round(revenue_at_risk / total_count, 2)
        },
        "safety_metrics": {
            "unsafe_actions_attempted": unsafe_attempted,
            "unsafe_actions_blocked": unsafe_blocked,
            "unsafe_block_rate_percent": unsafe_block_rate,
            "autonomous_actions_within_policy": safe_autonomous,
            "human_escalations": human_escalated,
            "stopped_actions": stopped_count,
            # Measured (not asserted): ₹ recovered by actions that were unsafe
            # per policy definitions yet still allowed. 0.0 here means measured zero.
            "unsafe_financial_leakage": round(unsafe_leakage, 2),
            # The honest cost of safety: latently-recoverable revenue the system
            # deliberately gated behind escalation/stop instead of acting on.
            "missed_recoverable_in_escalations": {
                "count": missed_recoverable_count,
                "revenue": round(missed_recoverable_revenue, 2)
            }
        },
        "decision_quality": {
            "brier_score": brier_score,
            "calibration_score": round(1.0 - brier_score, 4),
            "expected_calibration_error": expected_calibration_error,
            "action_distribution": action_counts,
            "confusion_by_action": confusion_by_action,
            "false_positives": false_positives,
            "false_negatives": false_negatives,
            "false_positive_cost": false_positive_cost
        },
        "honest_exceptions": honest_exceptions[:20],
        "calibration_curve": calibration_chart_data,
        "evaluated_at": datetime.utcnow()
    }

@router.get("/results")
def get_evaluation_results(db: Session = Depends(get_db)):
    """
    Returns latest evaluation results on the held-out evaluation split.
    """
    return run_evaluation_benchmark(dataset_split="eval", db=db)
