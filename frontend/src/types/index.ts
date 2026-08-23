export interface CustomerContext {
  customer_name?: string;
  tenure_months?: number;
  lifetime_value?: number;
  past_successful_payments?: number;
  past_failed_payments?: number;
  preferred_payment_method?: string;
  last_successful_payment_days_ago?: number;
  risk_score?: number;
  has_messaging_consent?: boolean;
}

export interface PaymentItem {
  payment_id: string;
  customer_id: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  amount: number;
  currency: string;
  payment_method: string;
  status: 'failed' | 'processing_recovery' | 'recovered' | 'permanently_failed' | 'escalated_to_human' | 'stopped';
  failure_reason: string;
  error_code: string;
  retry_count: number;
  amount_recovered: number;
  risk_score: number;
  dataset_split?: string;
  customer_context?: CustomerContext;
  created_at: string;
}

export interface IntelligenceSignals {
  provider?: string;
  gateway_health_score?: number;
  smart_routing_available?: boolean;
  suggested_optimal_retry_delay_sec?: number;
  customer_propensity_score?: number;
  intelligence_confidence?: number;
  vulcan_signals_applied?: boolean;
  bank_downtime_clearing_eta_sec?: number;
}

export interface RecoveryDecision {
  decision_id: string;
  failure_type: string;
  recommended_action: 'RETRY' | 'DELAYED_RETRY' | 'ALTERNATE_METHOD' | 'PAYMENT_LINK' | 'HUMAN_REVIEW' | 'STOP';
  recovery_probability: number;
  risk_level: string;
  expected_net_recovery: number;
  action_cost: number;
  reason: string;
  signals: IntelligenceSignals;
  critic_verdict?: string;
  critic_notes?: string;
  created_at: string;
}

export interface PolicyDecision {
  policy_decision_id: string;
  action: string;
  allowed: boolean;
  policy_rule: string;
  reason: string;
  created_at: string;
}

export interface RecoveryExecution {
  execution_id: string;
  action: string;
  status: string;
  result: string;
  amount_recovered: number;
  details: Record<string, unknown>;
  executed_at: string;
}

export interface AuditEvent {
  audit_id: string;
  payment_id: string;
  event_type: string;
  actor: string;
  metadata: {
    reason?: string;
    result?: string;
    message?: string;
    rule?: string;
    amount_recovered?: number;
    [key: string]: unknown;
  };
  timestamp: string;
}

export interface HumanReviewItem {
  review_id: string;
  payment_id: string;
  decision_id: string;
  amount: number;
  reason: string;
  risk_level: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewer: string;
  review_notes: string;
  proposed_action: string;
  customer_name: string;
  payment_method: string;
  failure_reason: string;
  customer_context: CustomerContext;
  created_at: string;
  resolved_at?: string;
}

export interface PolicyConfig {
  max_autonomous_retry_attempts: number;
  max_autonomous_amount: number;
  require_human_high_risk: boolean;
  stop_on_repeated_failure: boolean;
  require_customer_consent_for_nudge: boolean;
  escalate_unknown_failure: boolean;
  vulcan_enabled: boolean;
}

export interface SimulationResult {
  current_config: PolicyConfig;
  proposed_config: PolicyConfig;
  total_evaluated: number;
  baseline_recovered_revenue: number;
  simulated_recovered_revenue: number;
  revenue_delta: number;
  baseline_autonomous_recoveries: number;
  simulated_autonomous_recoveries: number;
  baseline_human_escalations: number;
  simulated_human_escalations: number;
  escalations_delta: number;
  risk_exposure_change_percent: number;
  projected_monthly_revenue_gain?: number;
  estimated_roi_multiplier?: number;
  explanation: string;
}

export interface DashboardKPIs {
  revenue_at_risk: number;
  revenue_recovered: number;
  recovery_rate_percent: number;
  recovered_transactions_count: number;
  pending_human_escalations: number;
  total_human_escalations: number;
  total_failed_transactions: number;
}

export interface StrategyStat {
  strategy: string;
  attempts: number;
  recoveries: number;
  recovery_rate_percent: number;
  revenue_recovered: number;
}

export interface CalibrationBin {
  bin: string;
  count: number;
  predicted_probability: number;
  actual_recovery_rate: number;
}

export interface EvaluationBenchmark {
  dataset_split: string;
  total_evaluated_transactions: number;
  financial_metrics: {
    revenue_at_risk: number;
    revenue_recovered: number;
    recovery_rate_percent: number;
    average_ticket_size: number;
  };
  safety_metrics: {
    unsafe_actions_attempted: number;
    unsafe_actions_blocked: number;
    unsafe_block_rate_percent: number;
    autonomous_actions_within_policy: number;
    human_escalations: number;
    stopped_actions: number;
    unsafe_financial_leakage: number;
  };
  decision_quality: {
    brier_score: number;
    calibration_score: number;
    action_distribution: Record<string, number>;
  };
  calibration_curve: CalibrationBin[];
  evaluated_at: string;
}

export interface AnomalyItem {
  error_code: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  recent_rate_percent: number;
  baseline_rate_percent: number;
  increase_multiplier: number;
  message: string;
  recommended_action: string;
}
