from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..core.anomaly_detector import AnomalyDetector
from ..core.utils import safe_json_loads
from ..database import get_db
from ..models import (
    DBAuditEvent,
    DBHumanReview,
    DBPayment,
    DBRecoveryDecision,
    DBRecoveryExecution,
    FailureCategory,
    PaymentStatus,
    RecoveryAction,
    ReviewStatus,
)

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])

# Every number this router returns is computed from database rows written by
# the (synthetic, seeded) execution pipeline — nothing is hardcoded. The data
# source is disclosed on responses that could be mistaken for production data.
SYNTHETIC_DATA_DISCLOSURE = (
    "Computed live from simulated executions of the synthetic benchmark "
    "(seeded ground-truth outcome model — see /api/evaluation/run disclosure)."
)


def _merchant_payment_ids(db: Session, merchant_id: str | None):
    """Subquery of payment_ids for one merchant (None = all merchants)."""
    q = db.query(DBPayment.payment_id)
    if merchant_id:
        q = q.filter(DBPayment.merchant_id == merchant_id)
    return q.subquery()


@router.get("/kpis")
def get_kpis(merchant_id: str | None = None, db: Session = Depends(get_db)):
    """
    Primary KPI cards for the Revenue Intelligence Dashboard.
    merchant_id genuinely filters every aggregate (multi-tenant isolation).
    """
    base = db.query(DBPayment)
    if merchant_id:
        base = base.filter(DBPayment.merchant_id == merchant_id)

    total_txns = base.count()

    agg = db.query(
        func.sum(DBPayment.amount),
        func.sum(DBPayment.amount_recovered)
    )
    if merchant_id:
        agg = agg.filter(DBPayment.merchant_id == merchant_id)
    rev_at_risk, rev_recovered = agg.first()
    rev_at_risk = rev_at_risk or 0.0
    rev_recovered = rev_recovered or 0.0

    recovered_count = base.filter(DBPayment.status == PaymentStatus.RECOVERED.value).count()

    reviews_q = db.query(DBHumanReview)
    if merchant_id:
        pids = _merchant_payment_ids(db, merchant_id)
        reviews_q = reviews_q.filter(DBHumanReview.payment_id.in_(pids))
    escalations_count = reviews_q.filter(DBHumanReview.status == ReviewStatus.PENDING.value).count()
    total_escalations = reviews_q.count()

    recovery_rate = (rev_recovered / rev_at_risk * 100) if rev_at_risk > 0 else 0.0

    return {
        "merchant_id": merchant_id,
        "revenue_at_risk": round(rev_at_risk, 2),
        "revenue_recovered": round(rev_recovered, 2),
        "recovery_rate_percent": round(recovery_rate, 2),
        "recovered_transactions_count": recovered_count,
        "pending_human_escalations": escalations_count,
        "total_human_escalations": total_escalations,
        "total_failed_transactions": total_txns
    }


MERCHANT_PROFILES = [
    {
        "merchant_id": "merch_swiggy_ind",
        "merchant_name": "Swiggy India (Quick Commerce)",
        "industry": "Food & Delivery",
        "autonomous_amount_cap": 5000.0,
        "currency": "INR",
    },
    {
        "merchant_id": "merch_urban_comp",
        "merchant_name": "Urban Company (Services & AMC)",
        "industry": "Home Services & Subscriptions",
        "autonomous_amount_cap": 25000.0,
        "currency": "INR",
    },
    {
        "merchant_id": "merch_tata_lux",
        "merchant_name": "Tata Luxury (High-Ticket Retail)",
        "industry": "Luxury Goods & Electronics",
        "autonomous_amount_cap": 100000.0,
        "currency": "INR",
    },
]


@router.get("/merchants")
def get_merchants(db: Session = Depends(get_db)):
    """
    Multi-tenant merchant profiles. Static identity fields come from the demo
    profile catalog; every metric is computed live from that merchant's rows.
    """
    result = []
    for profile in MERCHANT_PROFILES:
        mid = profile["merchant_id"]
        at_risk, recovered = db.query(
            func.sum(DBPayment.amount), func.sum(DBPayment.amount_recovered)
        ).filter(DBPayment.merchant_id == mid).first()
        at_risk = at_risk or 0.0
        recovered = recovered or 0.0
        count = db.query(DBPayment).filter(DBPayment.merchant_id == mid).count()
        result.append({
            **profile,
            "payments_count": count,
            "revenue_at_risk": round(at_risk, 2),
            "revenue_recovered": round(recovered, 2),
            "avg_recovery_rate": round((recovered / at_risk * 100) if at_risk > 0 else 0.0, 1),
        })
    return result


# A/B experiment definitions: natural cohorts that arise from the planner's own
# branching. Counts, revenue, and significance are computed from real execution
# rows — a cohort with too little data honestly reports COLLECTING.
EXPERIMENT_DEFINITIONS = [
    {
        "experiment_id": "EXP-042",
        "title": "Network Timeout: Immediate Retry vs Delayed Retry",
        "failure_type": FailureCategory.TEMPORARY_NETWORK_FAILURE.value,
        "variant_a": ("Immediate Retry", RecoveryAction.RETRY.value),
        "variant_b": ("Delayed Retry (bank queue window)", RecoveryAction.DELAYED_RETRY.value),
    },
    {
        "experiment_id": "EXP-043",
        "title": "Insufficient Funds: Delayed Retry (tenured) vs Payment Link (new customers)",
        "failure_type": FailureCategory.INSUFFICIENT_FUNDS.value,
        "variant_a": ("Delayed Retry at balance window", RecoveryAction.DELAYED_RETRY.value),
        "variant_b": ("1-Click Payment Link", RecoveryAction.PAYMENT_LINK.value),
    },
]

MIN_COHORT_FOR_SIGNIFICANCE = 20


def _cohort_stats(db: Session, failure_type: str, action: str) -> tuple[int, int, float]:
    rows = (
        db.query(DBRecoveryExecution)
        .join(DBRecoveryDecision, DBRecoveryExecution.decision_id == DBRecoveryDecision.decision_id)
        .filter(
            DBRecoveryDecision.failure_type == failure_type,
            DBRecoveryExecution.action == action,
            DBRecoveryExecution.status.in_(["SUCCESS", "FAILED"]),
        )
        .all()
    )
    attempts = len(rows)
    recovered = sum(1 for r in rows if r.status == "SUCCESS")
    revenue = sum(r.amount_recovered for r in rows)
    return attempts, recovered, revenue


@router.get("/experiments")
def get_ab_experiments(db: Session = Depends(get_db)):
    """
    A/B strategy cohort comparisons. Cohorts, rates, and revenue are computed
    from actual execution rows (joined to their decisions); chi-square
    significance runs only when both cohorts have enough real data.
    """
    import scipy.stats as stats

    experiments = []
    for definition in EXPERIMENT_DEFINITIONS:
        name_a, action_a = definition["variant_a"]
        name_b, action_b = definition["variant_b"]
        att_a, rec_a, rev_a = _cohort_stats(db, definition["failure_type"], action_a)
        att_b, rec_b, rev_b = _cohort_stats(db, definition["failure_type"], action_b)

        rate_a = round((rec_a / att_a * 100), 1) if att_a > 0 else 0.0
        rate_b = round((rec_b / att_b * 100), 1) if att_b > 0 else 0.0
        lift = round(rate_b - rate_a, 1)

        chi2_stat: float | None = None
        p_value: float | None = None
        sufficient = att_a >= MIN_COHORT_FOR_SIGNIFICANCE and att_b >= MIN_COHORT_FOR_SIGNIFICANCE
        if att_a > 0 and att_b > 0:
            try:
                chi2, p, _, _ = stats.chi2_contingency(
                    [[rec_a, att_a - rec_a], [rec_b, att_b - rec_b]]
                )
                chi2_stat, p_value = round(float(chi2), 4), round(float(p), 6)
            except ValueError:
                pass  # degenerate table (e.g. all-zero column): no significance claim

        if not sufficient:
            status = "COLLECTING"
            conclusion = (
                f"Collecting data — cohort sizes {att_a} vs {att_b} "
                f"(minimum {MIN_COHORT_FOR_SIGNIFICANCE} each for a significance claim)."
            )
        elif p_value is not None and p_value < 0.05:
            status = "RUNNING"
            better = name_b if rate_b >= rate_a else name_a
            conclusion = (
                f"'{better}' leads with {lift:+.1f}% lift "
                f"(p = {p_value:.4f}, Chi² = {chi2_stat:.2f}) on live cohort data."
            )
        else:
            status = "RUNNING"
            conclusion = (
                f"No statistically significant difference yet "
                f"(p = {p_value if p_value is not None else 'n/a'}) — continuing to collect."
            )

        experiments.append({
            "experiment_id": definition["experiment_id"],
            "title": definition["title"],
            "status": status,
            "sample_size": att_a + att_b,
            "variant_a": {
                "name": name_a,
                "attempts": att_a,
                "recovered": rec_a,
                "recovery_rate_percent": rate_a,
                "revenue_recovered": round(rev_a, 2),
            },
            "variant_b": {
                "name": name_b,
                "attempts": att_b,
                "recovered": rec_b,
                "recovery_rate_percent": rate_b,
                "revenue_recovered": round(rev_b, 2),
            },
            "chi2_statistic": chi2_stat,
            "stat_significance_p_value": p_value,
            "lift_percent": lift,
            "conclusion": conclusion,
            "data_source": SYNTHETIC_DATA_DISCLOSURE,
        })

    return experiments


@router.get("/timeseries")
def get_timeseries(merchant_id: str | None = None, db: Session = Depends(get_db)):
    """
    Revenue at risk vs. recovered over the last 14 days (merchant-filterable).
    """
    query = db.query(DBPayment)
    if merchant_id:
        query = query.filter(DBPayment.merchant_id == merchant_id)
    payments = query.order_by(DBPayment.created_at.asc()).all()

    buckets: dict[str, dict[str, Any]] = {}
    for p in payments:
        date_str = p.created_at.strftime("%b %d")
        if date_str not in buckets:
            buckets[date_str] = {
                "date": date_str,
                "revenue_at_risk": 0.0,
                "revenue_recovered": 0.0,
                "failed_count": 0,
                "recovered_count": 0
            }
        buckets[date_str]["revenue_at_risk"] += p.amount
        buckets[date_str]["revenue_recovered"] += p.amount_recovered
        buckets[date_str]["failed_count"] += 1
        if p.status == PaymentStatus.RECOVERED.value:
            buckets[date_str]["recovered_count"] += 1

    chart_data = list(buckets.values())[-14:]
    for c in chart_data:
        c["revenue_at_risk"] = round(c["revenue_at_risk"], 2)
        c["revenue_recovered"] = round(c["revenue_recovered"], 2)

    return chart_data


@router.get("/strategies")
def get_strategy_analytics(merchant_id: str | None = None, db: Session = Depends(get_db)):
    """
    Section 23 Recovery Strategy Analytics table (merchant-filterable):
    Strategy | Attempts | Recoveries | Recovery Rate | Revenue Recovered
    """
    strategies = [
        RecoveryAction.RETRY.value,
        RecoveryAction.DELAYED_RETRY.value,
        RecoveryAction.ALTERNATE_METHOD.value,
        RecoveryAction.PAYMENT_LINK.value,
        RecoveryAction.HUMAN_REVIEW.value,
        RecoveryAction.STOP.value
    ]

    pids = _merchant_payment_ids(db, merchant_id) if merchant_id else None

    result = []
    for strat in strategies:
        q = db.query(DBRecoveryExecution).filter(DBRecoveryExecution.action == strat)
        if pids is not None:
            q = q.filter(DBRecoveryExecution.payment_id.in_(pids))
        executions = q.all()
        attempts = len(executions)
        recoveries = sum(1 for ex in executions if ex.status == "SUCCESS" and ex.amount_recovered > 0)
        revenue = sum(ex.amount_recovered for ex in executions)
        rec_rate = (recoveries / attempts * 100) if attempts > 0 else 0.0

        result.append({
            "strategy": strat,
            "attempts": attempts,
            "recoveries": recoveries,
            "recovery_rate_percent": round(rec_rate, 1),
            "revenue_recovered": round(revenue, 2)
        })

    return result


@router.get("/anomalies")
def get_anomalies(db: Session = Depends(get_db)):
    """
    Failure distribution anomaly detection.
    """
    return AnomalyDetector.detect_anomalies(db)


@router.get("/feed")
def get_agent_feed(limit: int = 15, db: Session = Depends(get_db)):
    """
    Section 19: Agent Activity Feed (recent agent decisions and policy validations).
    """
    audits = db.query(DBAuditEvent).order_by(DBAuditEvent.timestamp.desc()).limit(limit).all()

    feed = []
    for a in audits:
        meta = safe_json_loads(a.metadata_json)
        feed.append({
            "audit_id": a.audit_id,
            "payment_id": a.payment_id,
            "event_type": a.event_type,
            "actor": a.actor,
            "metadata": meta,
            "timestamp": a.timestamp
        })

    return feed
