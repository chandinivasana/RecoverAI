# RecoverAI — Technical Specification & API Contracts

## 1. Data Schema Specifications

### `Payment`
```json
{
  "payment_id": "pay_10293",
  "customer_id": "cust_8821",
  "customer_name": "Rahul Sharma",
  "amount": 4500.00,
  "currency": "INR",
  "payment_method": "upi",
  "status": "failed",
  "failure_reason": "Bank network timeout during UPI PIN entry",
  "error_code": "GATEWAY_TIMEOUT",
  "created_at": "2026-08-22T14:42:01Z",
  "metadata": {
    "customer_tenure_months": 14,
    "customer_lifetime_value": 48200.0,
    "past_successful_payments": 12,
    "past_failed_payments": 1,
    "preferred_payment_method": "upi",
    "last_successful_payment_days_ago": 2,
    "risk_score": 0.08
  }
}
```

### `RecoveryDecision`
```json
{
  "decision_id": "dec_9921",
  "payment_id": "pay_10293",
  "failure_type": "TEMPORARY_NETWORK_FAILURE",
  "recommended_action": "RETRY",
  "recovery_probability": 0.84,
  "risk_level": "LOW",
  "expected_net_recovery": 3778.00,
  "action_cost": 2.00,
  "reason": "Temporary network timeout with high customer credibility score (92%) and 12 past successful UPI transactions.",
  "signals": {
    "gateway_health": 0.94,
    "customer_trust_score": 0.92,
    "optimal_retry_delay_seconds": 15
  },
  "created_at": "2026-08-22T14:42:02Z"
}
```

### `PolicyDecision`
```json
{
  "policy_decision_id": "pol_7712",
  "decision_id": "dec_9921",
  "payment_id": "pay_10293",
  "action": "RETRY",
  "allowed": true,
  "policy_rule": "MAX_RETRY_LIMIT",
  "reason": "Retry attempt count 1 is within max threshold 2, amount ₹4,500 is within autonomous limit ₹25,000.",
  "created_at": "2026-08-22T14:42:02Z"
}
```

### `RecoveryExecution`
```json
{
  "execution_id": "exec_3301",
  "payment_id": "pay_10293",
  "action": "RETRY",
  "status": "SUCCESS",
  "result": "Payment settled successfully via UPI rails.",
  "amount_recovered": 4500.00,
  "executed_at": "2026-08-22T14:42:05Z"
}
```

---

## 2. API Endpoints

- `POST /api/payments/events` — Ingest payment failure events (Idempotent by `event_id`)
- `GET /api/payments` — Query transactions with filtering by status, failure_type, risk
- `GET /api/payments/{payment_id}` — Get full transaction detail with context and audit trail
- `POST /api/recovery/{payment_id}/process` — Run complete agentic pipeline (Analyst -> Planner -> Policy -> Executor -> Audit)
- `POST /api/recovery/{payment_id}/analyze` — Run failure intelligence analysis
- `POST /api/recovery/{payment_id}/plan` — Run strategy recommendation agent
- `POST /api/recovery/{payment_id}/execute` — Run policy-guarded execution
- `GET /api/policies` — Fetch current merchant safety policies
- `PUT /api/policies` — Update merchant policy parameters
- `POST /api/policies/simulate` — Run policy what-if simulation on dataset
- `GET /api/reviews` — Fetch pending human escalation queue
- `POST /api/reviews/{id}/approve` — Approve escalated transaction
- `POST /api/reviews/{id}/reject` — Reject escalated transaction
- `POST /api/evaluation/run` — Run held-out test benchmark
- `GET /api/evaluation/results` — Get benchmark accuracy, calibration, and revenue recovery metrics
- `GET /api/analytics/kpis` — Aggregate KPIs (Revenue at risk, Recovered, Rate %, Escalations)
- `GET /api/analytics/timeseries` — Revenue recovered over time vs at-risk
- `GET /api/analytics/strategies` — Strategy performance breakdown
- `GET /api/analytics/anomalies` — Failure distribution anomaly detection
- `POST /api/replay` — Time-travel transaction debugger & what-if comparison
- `POST /api/redteam/run` — Adversarial attack validation suite
