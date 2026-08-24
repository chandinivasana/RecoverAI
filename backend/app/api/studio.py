import json
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..agents.payment_analyst import PaymentAnalyst
from ..core.audit import append_audit
from ..core.outcome_model import assign_ground_truth, simulate_action_outcome
from ..database import get_db
from ..models import (
    DBPayment,
    DBShadowTestRun,
    DBStudioPolicyRule,
    ShadowTestRunRequest,
    ShadowTestRunResponse,
    StudioPolicyRuleCreateRequest,
    StudioPolicyRuleResponse,
)

router = APIRouter(prefix="/api/studio", tags=["Policy Studio & Shadow Testing"])


@router.get("/rules", response_model=list[StudioPolicyRuleResponse])
def list_studio_rules(merchant_id: str | None = None, db: Session = Depends(get_db)):
    """List merchant custom policy rules and shadow rules."""
    q = db.query(DBStudioPolicyRule)
    if merchant_id:
        q = q.filter((DBStudioPolicyRule.merchant_id == merchant_id) | (DBStudioPolicyRule.merchant_id.is_(None)))
    rules = q.order_by(DBStudioPolicyRule.priority.asc(), DBStudioPolicyRule.id.desc()).all()
    return rules


@router.post("/rules", response_model=StudioPolicyRuleResponse)
def create_studio_rule(req: StudioPolicyRuleCreateRequest, db: Session = Depends(get_db)):
    """Create a new custom policy rule (live or shadow mode)."""
    rule_id = f"rule_{uuid.uuid4().hex[:8]}"
    rule = DBStudioPolicyRule(
        rule_id=rule_id,
        merchant_id=req.merchant_id,
        name=req.name,
        description=req.description,
        condition_field=req.condition_field,
        operator=req.operator,
        value=req.value,
        action=req.action,
        priority=req.priority,
        is_active=req.is_active,
        is_shadow=req.is_shadow,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}")
def delete_studio_rule(rule_id: str, db: Session = Depends(get_db)):
    """Deletes or deactivates a custom studio rule."""
    rule = db.query(DBStudioPolicyRule).filter(DBStudioPolicyRule.rule_id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()
    return {"status": "deleted", "rule_id": rule_id}


@router.post("/shadow-test/run", response_model=ShadowTestRunResponse)
def run_shadow_test(req: ShadowTestRunRequest, db: Session = Depends(get_db)):
    """
    Executes a counterfactual Shadow Test on historical payments.
    Evaluates current baseline policy vs shadow rules, computing projected revenue delta and safety score.
    """
    q = db.query(DBPayment).filter(DBPayment.dataset_split == req.dataset_split)
    if req.merchant_id:
        q = q.filter(DBPayment.merchant_id == req.merchant_id)
    
    payments = q.limit(req.sample_size).all()
    if not payments:
        payments = db.query(DBPayment).limit(req.sample_size).all()

    # Fetch active shadow rules
    shadow_rules = db.query(DBStudioPolicyRule).filter(
        DBStudioPolicyRule.is_active == True,  # noqa: E712
        DBStudioPolicyRule.is_shadow == True   # noqa: E712
    ).order_by(DBStudioPolicyRule.priority.asc()).all()

    total_eval = len(payments)
    match_count = 0
    divergence_count = 0
    baseline_revenue = 0.0
    shadow_revenue = 0.0
    baseline_escalations = 0
    shadow_escalations = 0
    divergences: list[dict[str, Any]] = []

    for p in payments:
        # Customer metadata
        meta = {}
        if p.metadata_json:
            try:
                meta = json.loads(p.metadata_json)
            except Exception:
                pass

        # Categorize failure
        analyst_res = PaymentAnalyst.analyze(
            {"amount": p.amount, "failure_reason": p.failure_reason, "error_code": p.error_code or "", "payment_method": p.payment_method},
            meta
        )
        cat = analyst_res["failure_type"]
        
        rec = p.ground_truth_recoverable
        seed = p.outcome_seed
        if rec is None or seed is None:
            rec, _, seed = assign_ground_truth(p.payment_id, cat, p.amount, meta)

        # Baseline action determination
        if p.amount > 25000:
            baseline_action = "HUMAN_REVIEW"
        elif "timeout" in p.failure_reason.lower():
            baseline_action = "RETRY"
        elif "insufficient" in p.failure_reason.lower():
            baseline_action = "PAYMENT_LINK"
        else:
            baseline_action = "DELAYED_RETRY"

        # Apply Shadow Rules
        shadow_action = baseline_action
        applied_rule_name = None
        for rule in shadow_rules:
            if _evaluate_condition(p, rule.condition_field, rule.operator, rule.value):
                shadow_action = rule.action
                applied_rule_name = rule.name
                break

        # Ground truth recovery evaluation
        gt_baseline_rec = simulate_action_outcome(rec, seed, baseline_action, cat)
        gt_shadow_rec = simulate_action_outcome(rec, seed, shadow_action, cat)

        if baseline_action == "HUMAN_REVIEW":
            baseline_escalations += 1
        elif gt_baseline_rec:
            baseline_revenue += p.amount

        if shadow_action == "HUMAN_REVIEW":
            shadow_escalations += 1
        elif gt_shadow_rec:
            shadow_revenue += p.amount

        if baseline_action == shadow_action:
            match_count += 1
        else:
            divergence_count += 1
            if len(divergences) < 10:
                divergences.append({
                    "payment_id": p.payment_id,
                    "amount": p.amount,
                    "failure_reason": p.failure_reason,
                    "baseline_action": baseline_action,
                    "shadow_action": shadow_action,
                    "rule_triggered": applied_rule_name or "Custom Strategy",
                    "revenue_delta": (p.amount if gt_shadow_rec else 0.0) - (p.amount if gt_baseline_rec else 0.0)
                })

    match_pct = round((match_count / max(1, total_eval)) * 100, 2)
    rev_delta = round(shadow_revenue - baseline_revenue, 2)
    safety_score = round(max(0.0, min(100.0, 100.0 - (divergence_count * 1.5))), 1)

    recommendation = "SAFE_TO_PROMOTE" if rev_delta >= 0 and safety_score >= 85.0 else (
        "REVIEW_RECOMMENDED" if rev_delta >= 0 else "DO_NOT_PROMOTE"
    )

    run_id = f"shd_{uuid.uuid4().hex[:10]}"
    test_run = DBShadowTestRun(
        run_id=run_id,
        merchant_id=req.merchant_id,
        total_evaluated=total_eval,
        decision_match_count=match_count,
        decision_divergence_count=divergence_count,
        baseline_recovered_revenue=baseline_revenue,
        shadow_recovered_revenue=shadow_revenue,
        projected_revenue_delta=rev_delta,
        baseline_escalations=baseline_escalations,
        shadow_escalations=shadow_escalations,
        divergences_json=json.dumps(divergences),
        created_at=datetime.utcnow()
    )
    db.add(test_run)

    append_audit(db, payments[0].payment_id if payments else "system", "SHADOW_POLICY_TEST_EXECUTED", "PolicyStudioEngine", {
        "run_id": run_id,
        "sample_size": total_eval,
        "divergence_count": divergence_count,
        "projected_revenue_delta": rev_delta,
        "safety_score": safety_score
    })
    db.commit()

    return ShadowTestRunResponse(
        run_id=run_id,
        merchant_id=req.merchant_id,
        total_evaluated=total_eval,
        decision_match_count=match_count,
        decision_divergence_count=divergence_count,
        match_rate_percent=match_pct,
        baseline_recovered_revenue=baseline_revenue,
        shadow_recovered_revenue=shadow_revenue,
        projected_revenue_delta=rev_delta,
        baseline_escalations=baseline_escalations,
        shadow_escalations=shadow_escalations,
        safety_score=safety_score,
        divergences_sample=divergences,
        recommendation=recommendation,
        created_at=datetime.utcnow()
    )


def _evaluate_condition(payment: DBPayment, field: str, op: str, val_str: str) -> bool:
    try:
        if field == "amount":
            actual_val = payment.amount
            target_val = float(val_str)
        elif field == "failure_type" or field == "failure_reason":
            actual_val = payment.failure_reason.lower()
            target_val = val_str.lower()
        elif field == "payment_method":
            actual_val = payment.payment_method.lower()
            target_val = val_str.lower()
        elif field == "risk_score":
            actual_val = payment.risk_score
            target_val = float(val_str)
        else:
            return False

        if op == "gt":
            return actual_val > target_val
        elif op == "gte":
            return actual_val >= target_val
        elif op == "lt":
            return actual_val < target_val
        elif op == "lte":
            return actual_val <= target_val
        elif op == "eq":
            return actual_val == target_val
        elif op == "neq":
            return actual_val != target_val
        elif op == "in":
            return str(actual_val) in [v.strip() for v in val_str.split(",")]
    except Exception:
        return False
    return False
