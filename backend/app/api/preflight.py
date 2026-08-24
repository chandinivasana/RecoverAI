import json
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..core.preflight_optimizer import BANK_HEALTH_MATRIX, PreflightOptimizer
from ..core.rate_limiter import AcquirerRateLimitManager
from ..database import get_db
from ..models import DBPreflightLog, PreflightEvaluateRequest, PreflightEvaluateResponse

router = APIRouter(prefix="/api/preflight", tags=["Pre-Flight Optimization"])


@router.post("/evaluate", response_model=PreflightEvaluateResponse)
def evaluate_checkout_preflight(req: PreflightEvaluateRequest, db: Session = Depends(get_db)):
    """
    Evaluates checkout parameters before payment execution to prevent failure.
    Identifies bank downtime, circuit breakers, and suggests smart routing or method reordering.
    """
    res = PreflightOptimizer.evaluate(req)

    # Telemetry logging
    log = DBPreflightLog(
        request_id=res.request_id,
        merchant_id=res.merchant_id,
        customer_id=req.customer_id,
        amount=req.amount,
        payment_method=req.payment_method,
        bank_code=req.bank_code,
        recommendation=res.recommendation,
        recommended_method=res.recommended_method,
        success_probability=res.success_probability,
        predicted_latency_ms=res.predicted_latency_ms,
        reasons_json=json.dumps(res.reasons),
        created_at=datetime.utcnow()
    )
    db.add(log)
    db.commit()

    return res


@router.get("/acquirers")
def get_acquirer_network_health():
    """
    Returns real-time health matrix across major Indian acquirers and payment rails.
    """
    results = []
    allowed_upi, _ = AcquirerRateLimitManager.check_acquirer_capacity("upi", "ACQUIRER_TIMEOUT")
    for bank, data in BANK_HEALTH_MATRIX.items():
        results.append({
            "bank_code": bank,
            "bank_name": f"{bank} Bank",
            "status": data["status"],
            "avg_latency_ms": data["latency_ms"],
            "upi_success_rate": data["upi_success"],
            "card_success_rate": data["card_success"],
            "netbanking_success_rate": data["netbanking_success"],
            "circuit_breaker": "TRIPPED" if not allowed_upi else "HEALTHY"
        })
    return {"acquirers": results, "total_monitored": len(results)}


@router.get("/stats")
def get_preflight_prevention_stats(db: Session = Depends(get_db)):
    """Summary of preventative optimizations performed."""
    total_evals = db.query(DBPreflightLog).count()
    routed = db.query(DBPreflightLog).filter(DBPreflightLog.recommendation.in_(["SMART_ROUTE", "REORDER_METHODS"])).count()
    warned = db.query(DBPreflightLog).filter(DBPreflightLog.recommendation == "WARN_DEGRADED").count()
    
    return {
        "total_preflight_checks": total_evals,
        "preventative_reroutes": routed,
        "degradation_warnings_issued": warned,
        "estimated_failures_prevented": int(routed * 0.72 + warned * 0.35),
        "prevention_rate_percent": round((routed + warned) / max(1, total_evals) * 100, 1)
    }
