import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..agents.payment_analyst import PaymentAnalyst
from ..agents.recovery_planner import RecoveryPlanner
from ..core.config_store import get_active_policy_config
from ..core.cost_optimizer import CostOptimizer
from ..core.outcome_model import assign_ground_truth, simulate_action_outcome
from ..database import get_db
from ..models import DBPayment, DBPolicyConfig, PolicyConfigSchema, PolicySimulationRequest, PolicySimulationResponse
from ..policy.engine import PolicyEngine

router = APIRouter(prefix="/api/policies", tags=["Policies"])

@router.get("", response_model=PolicyConfigSchema)
def get_policies(db: Session = Depends(get_db)):
    config = get_active_policy_config(db)
    return PolicyConfigSchema(
        max_autonomous_retry_attempts=config.max_autonomous_retry_attempts,
        max_autonomous_amount=config.max_autonomous_amount,
        require_human_high_risk=config.require_human_high_risk,
        stop_on_repeated_failure=config.stop_on_repeated_failure,
        require_customer_consent_for_nudge=config.require_customer_consent_for_nudge,
        escalate_unknown_failure=config.escalate_unknown_failure,
        vulcan_enabled=config.vulcan_enabled
    )

@router.put("", response_model=PolicyConfigSchema)
def update_policies(new_config: PolicyConfigSchema, db: Session = Depends(get_db)):
    config = get_active_policy_config(db)
    config.max_autonomous_retry_attempts = new_config.max_autonomous_retry_attempts
    config.max_autonomous_amount = new_config.max_autonomous_amount
    config.require_human_high_risk = new_config.require_human_high_risk
    config.stop_on_repeated_failure = new_config.stop_on_repeated_failure
    config.require_customer_consent_for_nudge = new_config.require_customer_consent_for_nudge
    config.escalate_unknown_failure = new_config.escalate_unknown_failure
    config.vulcan_enabled = new_config.vulcan_enabled
    config.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(config)
    return new_config

@router.post("/simulate", response_model=PolicySimulationResponse)
def simulate_policy_impact(req: PolicySimulationRequest, db: Session = Depends(get_db)):
    """
    Simulates what would happen if merchant policy changed (e.g. limit raised from ₹25k to ₹50k).
    Runs offline evaluation on transactions to measure projected revenue gain vs additional risk exposure.
    """
    current_config = get_active_policy_config(db)
    
    query = db.query(DBPayment)
    if req.dataset_split and req.dataset_split != "all":
        query = query.filter(DBPayment.dataset_split == req.dataset_split)
    
    payments = query.limit(300).all()
    if not payments:
        raise HTTPException(status_code=400, detail="No transactions found for simulation.")

    # Create temporary mock config object for proposed
    proposed_cfg_obj = DBPolicyConfig(
        max_autonomous_retry_attempts=req.proposed_config.max_autonomous_retry_attempts,
        max_autonomous_amount=req.proposed_config.max_autonomous_amount,
        require_human_high_risk=req.proposed_config.require_human_high_risk,
        stop_on_repeated_failure=req.proposed_config.stop_on_repeated_failure,
        require_customer_consent_for_nudge=req.proposed_config.require_customer_consent_for_nudge,
        escalate_unknown_failure=req.proposed_config.escalate_unknown_failure,
        vulcan_enabled=req.proposed_config.vulcan_enabled
    )

    base_recovered = 0.0
    sim_recovered = 0.0
    base_auto_count = 0
    sim_auto_count = 0
    base_escalations = 0
    sim_escalations = 0
    high_value_at_risk = 0.0
    added_action_costs = 0.0  # cost of executions newly allowed by the proposed policy

    for p in payments:
        cust_ctx = json.loads(p.metadata_json or "{}")
        pay_data = {
            "payment_id": p.payment_id,
            "amount": p.amount,
            "payment_method": p.payment_method,
            "failure_reason": p.failure_reason,
            "error_code": p.error_code,
            "retry_count": p.retry_count
        }

        # Analyze & Plan
        analysis = PaymentAnalyst.analyze(pay_data, cust_ctx, vulcan_enabled=current_config.vulcan_enabled)
        pay_data["failure_type"] = analysis["failure_type"]
        pay_data["risk_level"] = analysis["risk_level"]
        plan = RecoveryPlanner.plan(analysis, pay_data, cust_ctx)
        action = plan["recommended_action"]

        # Outcome from the seeded ground-truth model (core/outcome_model.py),
        # never from thresholding the planner's own prediction.
        recoverable = p.ground_truth_recoverable
        outcome_seed = p.outcome_seed
        if recoverable is None or outcome_seed is None:
            recoverable, _gt_prob, outcome_seed = assign_ground_truth(
                p.payment_id, analysis["failure_type"], p.amount, cust_ctx
            )
        is_success = simulate_action_outcome(recoverable, outcome_seed, action, analysis["failure_type"])

        # Current Policy (dry_run: what-if simulation must not mutate shared state)
        base_policy = PolicyEngine.evaluate(action, pay_data, cust_ctx, current_config, dry_run=True)
        if base_policy.allowed:
            base_auto_count += 1
            if is_success:
                base_recovered += p.amount
        elif base_policy.requires_escalation:
            base_escalations += 1

        # Proposed Policy
        sim_policy = PolicyEngine.evaluate(action, pay_data, cust_ctx, proposed_cfg_obj, dry_run=True)
        if sim_policy.allowed:
            sim_auto_count += 1
            if is_success:
                sim_recovered += p.amount
            if p.amount > current_config.max_autonomous_amount:
                high_value_at_risk += p.amount
            if not base_policy.allowed:
                added_action_costs += CostOptimizer.get_action_cost(action)
        elif sim_policy.requires_escalation:
            sim_escalations += 1

    rev_delta = sim_recovered - base_recovered
    esc_delta = sim_escalations - base_escalations
    risk_pct = round((high_value_at_risk / max(1.0, base_recovered)) * 100, 1)

    # Monthly projection derived from the actual time span of the evaluated data
    # (linear extrapolation) instead of a magic constant.
    created_ats = [p.created_at for p in payments if p.created_at is not None]
    if len(created_ats) >= 2:
        span_days = max(1.0, (max(created_ats) - min(created_ats)).total_seconds() / 86400.0)
    else:
        span_days = 30.0
    monthly_gain = round(rev_delta * (30.0 / span_days), 2)
    projection_basis = (
        f"Linear extrapolation of a {span_days:.1f}-day synthetic data window to 30 days."
    )

    # ROI of the policy change: revenue delta per rupee of newly-incurred action cost.
    roi_multiplier = round(rev_delta / added_action_costs, 1) if added_action_costs > 0 else 0.0

    explanation = (
        f"Simulating policy adjustments across {len(payments)} transactions: "
        f"Projected recovered revenue shifts by {'+' if rev_delta >= 0 else ''}₹{rev_delta:,.2f} "
        f"(~{'+' if monthly_gain >= 0 else ''}₹{monthly_gain:,.2f}/month projected). "
        f"Human escalations shift by {'+' if esc_delta >= 0 else ''}{esc_delta}. "
        f"Additional autonomous risk exposure is ₹{high_value_at_risk:,.2f} ({risk_pct}%)."
    )

    return PolicySimulationResponse(
        current_config=PolicyConfigSchema(
            max_autonomous_retry_attempts=current_config.max_autonomous_retry_attempts,
            max_autonomous_amount=current_config.max_autonomous_amount,
            require_human_high_risk=current_config.require_human_high_risk,
            stop_on_repeated_failure=current_config.stop_on_repeated_failure,
            require_customer_consent_for_nudge=current_config.require_customer_consent_for_nudge,
            escalate_unknown_failure=current_config.escalate_unknown_failure,
            vulcan_enabled=current_config.vulcan_enabled
        ),
        proposed_config=req.proposed_config,
        total_evaluated=len(payments),
        baseline_recovered_revenue=round(base_recovered, 2),
        simulated_recovered_revenue=round(sim_recovered, 2),
        revenue_delta=round(rev_delta, 2),
        baseline_autonomous_recoveries=base_auto_count,
        simulated_autonomous_recoveries=sim_auto_count,
        baseline_human_escalations=base_escalations,
        simulated_human_escalations=sim_escalations,
        escalations_delta=esc_delta,
        risk_exposure_change_percent=risk_pct,
        projected_monthly_revenue_gain=monthly_gain,
        estimated_roi_multiplier=roi_multiplier,
        projection_basis=projection_basis,
        explanation=explanation
    )
