import enum
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


class FailureCategory(str, enum.Enum):
    TEMPORARY_NETWORK_FAILURE = "TEMPORARY_NETWORK_FAILURE"
    INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS"
    PAYMENT_METHOD_FAILURE = "PAYMENT_METHOD_FAILURE"
    CHECKOUT_ABANDONMENT = "CHECKOUT_ABANDONMENT"
    HIGH_RISK = "HIGH_RISK"
    UNKNOWN = "UNKNOWN"

class RecoveryAction(str, enum.Enum):
    RETRY = "RETRY"
    DELAYED_RETRY = "DELAYED_RETRY"
    ALTERNATE_METHOD = "ALTERNATE_METHOD"
    PAYMENT_LINK = "PAYMENT_LINK"
    HUMAN_REVIEW = "HUMAN_REVIEW"
    STOP = "STOP"

class PaymentStatus(str, enum.Enum):
    FAILED = "failed"
    PROCESSING_RECOVERY = "processing_recovery"
    RECOVERED = "recovered"
    PERMANENTLY_FAILED = "permanently_failed"
    ESCALATED_TO_HUMAN = "escalated_to_human"
    STOPPED = "stopped"

class RiskLevel(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class ReviewStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"

# --- SQLAlchemy Database Models ---

class DBPayment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    payment_id = Column(String(64), unique=True, index=True, nullable=False)
    customer_id = Column(String(64), index=True, nullable=False)
    customer_name = Column(String(128), default="Anonymous")
    customer_email = Column(String(128), default="")
    customer_phone = Column(String(32), default="")
    amount = Column(Float, nullable=False)
    currency = Column(String(8), default="INR")
    payment_method = Column(String(32), nullable=False)  # upi, card, netbanking, wallet, emi
    status = Column(String(32), default=PaymentStatus.FAILED.value)
    failure_reason = Column(Text, nullable=False)
    error_code = Column(String(64), default="UNKNOWN")
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=2)
    amount_recovered = Column(Float, default=0.0)
    risk_score = Column(Float, default=0.1)
    dataset_split = Column(String(16), default="dev")  # dev, eval
    # Multi-tenant isolation: every payment belongs to exactly one merchant
    # (assigned deterministically by core/utils.py::merchant_for_amount).
    merchant_id = Column(String(64), index=True, nullable=True)
    # Synthetic-benchmark ground truth (see core/outcome_model.py). Latent
    # recoverability drawn independently of the planner; nullable so ad-hoc
    # payments get it lazily assigned at execution time.
    ground_truth_recoverable = Column(Boolean, nullable=True)
    ground_truth_prob = Column(Float, nullable=True)
    outcome_seed = Column(Integer, nullable=True)
    metadata_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    events = relationship("DBPaymentEvent", back_populates="payment", cascade="all, delete-orphan")
    decisions = relationship("DBRecoveryDecision", back_populates="payment", cascade="all, delete-orphan")
    executions = relationship("DBRecoveryExecution", back_populates="payment", cascade="all, delete-orphan")
    audit_events = relationship("DBAuditEvent", back_populates="payment", cascade="all, delete-orphan")
    reviews = relationship("DBHumanReview", back_populates="payment", cascade="all, delete-orphan")

class DBPaymentEvent(Base):
    __tablename__ = "payment_events"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(String(64), unique=True, index=True, nullable=False)
    payment_id = Column(String(64), ForeignKey("payments.payment_id"), index=True, nullable=False)
    event_type = Column(String(64), nullable=False)  # payment.failed, payment.retried, etc.
    payload_json = Column(Text, default="{}")
    processed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)

    payment = relationship("DBPayment", back_populates="events")

class DBRecoveryDecision(Base):
    __tablename__ = "recovery_decisions"

    id = Column(Integer, primary_key=True, index=True)
    decision_id = Column(String(64), unique=True, index=True, nullable=False)
    payment_id = Column(String(64), ForeignKey("payments.payment_id"), index=True, nullable=False)
    failure_type = Column(String(64), nullable=False)
    recommended_action = Column(String(32), nullable=False)
    recovery_probability = Column(Float, nullable=False)
    risk_level = Column(String(16), nullable=False)
    expected_net_recovery = Column(Float, default=0.0)
    action_cost = Column(Float, default=0.0)
    reason = Column(Text, nullable=False)
    signals_json = Column(Text, default="{}")
    critic_verdict = Column(String(32), default="AGREE")
    critic_notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    payment = relationship("DBPayment", back_populates="decisions")
    policy_decisions = relationship("DBPolicyDecision", back_populates="decision", cascade="all, delete-orphan")

class DBPolicyDecision(Base):
    __tablename__ = "policy_decisions"

    id = Column(Integer, primary_key=True, index=True)
    policy_decision_id = Column(String(64), unique=True, index=True, nullable=False)
    decision_id = Column(String(64), ForeignKey("recovery_decisions.decision_id"), index=True, nullable=False)
    payment_id = Column(String(64), index=True, nullable=False)
    action = Column(String(32), nullable=False)
    allowed = Column(Boolean, nullable=False)
    policy_rule = Column(String(64), nullable=False)
    reason = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    decision = relationship("DBRecoveryDecision", back_populates="policy_decisions")

class DBRecoveryExecution(Base):
    __tablename__ = "recovery_executions"

    id = Column(Integer, primary_key=True, index=True)
    execution_id = Column(String(64), unique=True, index=True, nullable=False)
    payment_id = Column(String(64), ForeignKey("payments.payment_id"), index=True, nullable=False)
    # Links the execution back to the decision that produced it, so analytics
    # can join executions to failure types without heuristics.
    decision_id = Column(String(64), index=True, nullable=True)
    action = Column(String(32), nullable=False)
    status = Column(String(32), nullable=False)  # SUCCESS, FAILED, ESCALATED, STOPPED
    result = Column(Text, nullable=False)
    amount_recovered = Column(Float, default=0.0)
    details_json = Column(Text, default="{}")
    executed_at = Column(DateTime, default=datetime.utcnow)

    payment = relationship("DBPayment", back_populates="executions")

class DBAuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(Integer, primary_key=True, index=True)
    audit_id = Column(String(64), unique=True, index=True, nullable=False)
    payment_id = Column(String(64), ForeignKey("payments.payment_id"), index=True, nullable=False)
    event_type = Column(String(64), nullable=False)
    actor = Column(String(64), nullable=False)  # Analyst, Planner, PolicyEngine, Executor, HumanReviewer, System
    metadata_json = Column(Text, default="{}")
    timestamp = Column(DateTime, default=datetime.utcnow)
    # Tamper-evident SHA-256 hash chain (see core/audit.py). All writes must go
    # through core.audit.append_audit — never construct rows directly.
    prev_hash = Column(String(64), nullable=True)
    entry_hash = Column(String(64), index=True, nullable=True)

    payment = relationship("DBPayment", back_populates="audit_events")

class DBHumanReview(Base):
    __tablename__ = "human_reviews"

    id = Column(Integer, primary_key=True, index=True)
    review_id = Column(String(64), unique=True, index=True, nullable=False)
    payment_id = Column(String(64), ForeignKey("payments.payment_id"), index=True, nullable=False)
    decision_id = Column(String(64), index=True, nullable=False)
    amount = Column(Float, nullable=False)
    reason = Column(Text, nullable=False)
    risk_level = Column(String(16), default="HIGH")
    status = Column(String(16), default=ReviewStatus.PENDING.value)
    reviewer = Column(String(64), default="")
    review_notes = Column(Text, default="")
    proposed_action = Column(String(32), default=RecoveryAction.RETRY.value)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    payment = relationship("DBPayment", back_populates="reviews")

class DBPolicyConfig(Base):
    __tablename__ = "policy_configs"

    id = Column(Integer, primary_key=True, index=True)
    max_autonomous_retry_attempts = Column(Integer, default=2)
    max_autonomous_amount = Column(Float, default=25000.0)
    require_human_high_risk = Column(Boolean, default=True)
    stop_on_repeated_failure = Column(Boolean, default=True)
    require_customer_consent_for_nudge = Column(Boolean, default=True)
    escalate_unknown_failure = Column(Boolean, default=True)
    vulcan_enabled = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# --- P1: Webhook Ingestion Model ---

class DBWebhookLog(Base):
    __tablename__ = "webhook_logs"

    id = Column(Integer, primary_key=True, index=True)
    webhook_id = Column(String(64), unique=True, index=True, nullable=False)
    gateway = Column(String(32), nullable=False)  # razorpay, stripe
    event_type = Column(String(64), nullable=False)
    event_id = Column(String(64), index=True, nullable=False)
    payment_id = Column(String(64), index=True, nullable=True)
    signature_valid = Column(Boolean, default=True)
    payload_json = Column(Text, default="{}")
    status = Column(String(32), default="PROCESSED")  # PROCESSED, REJECTED, DUPLICATE, FAILED
    pipeline_result_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow)


# --- P2: Pre-Flight Optimization Model ---

class DBPreflightLog(Base):
    __tablename__ = "preflight_logs"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(String(64), unique=True, index=True, nullable=False)
    merchant_id = Column(String(64), index=True, nullable=True)
    customer_id = Column(String(64), index=True, nullable=False)
    amount = Column(Float, nullable=False)
    payment_method = Column(String(32), nullable=False)
    bank_code = Column(String(32), nullable=True)
    recommendation = Column(String(32), nullable=False)  # ALLOW, SMART_ROUTE, REORDER_METHODS, WARN_DEGRADED, BLOCK
    recommended_method = Column(String(32), nullable=True)
    success_probability = Column(Float, default=0.9)
    predicted_latency_ms = Column(Integer, default=450)
    reasons_json = Column(Text, default="[]")
    created_at = Column(DateTime, default=datetime.utcnow)


# --- P3: Dynamic Recovery Link Model ---

class DBRecoveryLink(Base):
    __tablename__ = "recovery_links"

    id = Column(Integer, primary_key=True, index=True)
    link_id = Column(String(64), unique=True, index=True, nullable=False)
    payment_id = Column(String(64), ForeignKey("payments.payment_id"), index=True, nullable=False)
    customer_id = Column(String(64), index=True, nullable=False)
    customer_name = Column(String(128), default="Anonymous")
    customer_phone = Column(String(32), default="")
    customer_email = Column(String(128), default="")
    amount = Column(Float, nullable=False)
    currency = Column(String(8), default="INR")
    channel = Column(String(32), default="whatsapp")  # whatsapp, sms, email
    short_url = Column(String(256), nullable=False)
    status = Column(String(32), default="ACTIVE")  # ACTIVE, DELIVERED, VIEWED, COMPLETED, EXPIRED
    discount_amount = Column(Float, default=0.0)
    failure_reason = Column(Text, default="")
    suggested_method = Column(String(32), default="upi")
    alternate_methods_json = Column(Text, default="[]")
    message_content = Column(Text, default="")
    dpdp_consent_verified = Column(Boolean, default=True)
    expires_at = Column(DateTime, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    payment = relationship("DBPayment")


# --- P4: Policy Studio & Shadow Testing Models ---

class DBStudioPolicyRule(Base):
    __tablename__ = "studio_policy_rules"

    id = Column(Integer, primary_key=True, index=True)
    rule_id = Column(String(64), unique=True, index=True, nullable=False)
    merchant_id = Column(String(64), index=True, nullable=True)
    name = Column(String(128), nullable=False)
    description = Column(Text, default="")
    condition_field = Column(String(64), nullable=False)  # amount, failure_type, risk_score, retry_count, payment_method
    operator = Column(String(16), nullable=False)  # gt, gte, lt, lte, eq, neq, in
    value = Column(String(128), nullable=False)
    action = Column(String(32), nullable=False)  # RETRY, DELAYED_RETRY, PAYMENT_LINK, HUMAN_REVIEW, STOP
    priority = Column(Integer, default=10)
    is_active = Column(Boolean, default=True)
    is_shadow = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DBShadowTestRun(Base):
    __tablename__ = "shadow_test_runs"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(String(64), unique=True, index=True, nullable=False)
    merchant_id = Column(String(64), index=True, nullable=True)
    total_evaluated = Column(Integer, default=0)
    decision_match_count = Column(Integer, default=0)
    decision_divergence_count = Column(Integer, default=0)
    baseline_recovered_revenue = Column(Float, default=0.0)
    shadow_recovered_revenue = Column(Float, default=0.0)
    projected_revenue_delta = Column(Float, default=0.0)
    baseline_escalations = Column(Integer, default=0)
    shadow_escalations = Column(Integer, default=0)
    divergences_json = Column(Text, default="[]")
    created_at = Column(DateTime, default=datetime.utcnow)


# --- P5: DPDP Consent Log Model ---

class DBConsentRecord(Base):
    __tablename__ = "consent_records"

    id = Column(Integer, primary_key=True, index=True)
    record_id = Column(String(64), unique=True, index=True, nullable=False)
    customer_id = Column(String(64), index=True, nullable=False)
    channel = Column(String(32), default="messaging")
    granted = Column(Boolean, default=True)
    purpose = Column(String(128), default="payment_recovery_and_transaction_updates")
    legal_basis = Column(String(64), default="DPDP_ACT_2023_SECTION_6")
    ip_address = Column(String(64), default="127.0.0.1")
    timestamp = Column(DateTime, default=datetime.utcnow)
    valid_until = Column(DateTime, nullable=True)


# --- Pydantic API Schemas ---

class CustomerContext(BaseModel):
    customer_id: str
    customer_name: str | None = "Anonymous"
    tenure_months: int | None = 6
    lifetime_value: float | None = 10000.0
    past_successful_payments: int | None = 5
    past_failed_payments: int | None = 1
    preferred_payment_method: str | None = "upi"
    last_successful_payment_days_ago: int | None = 3
    risk_score: float | None = 0.1
    has_messaging_consent: bool | None = True

class PaymentEventIngestRequest(BaseModel):
    event_id: str
    payment_id: str
    customer_id: str
    customer_name: str | None = "Anonymous"
    customer_email: str | None = ""
    customer_phone: str | None = ""
    amount: float
    currency: str = "INR"
    payment_method: str
    failure_reason: str
    error_code: str | None = "GENERIC_ERROR"
    timestamp: str | None = None
    customer_context: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None

class PaymentResponse(BaseModel):
    payment_id: str
    customer_id: str
    customer_name: str
    amount: float
    currency: str
    payment_method: str
    status: str
    failure_reason: str
    error_code: str
    retry_count: int
    amount_recovered: float
    risk_score: float
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class RecoveryDecisionResponse(BaseModel):
    decision_id: str
    payment_id: str
    failure_type: str
    recommended_action: str
    recovery_probability: float
    risk_level: str
    expected_net_recovery: float
    action_cost: float
    reason: str
    signals: dict[str, Any]
    critic_verdict: str | None = "AGREE"
    critic_notes: str | None = ""
    requires_human: bool = False
    created_at: datetime

class PolicyDecisionResponse(BaseModel):
    policy_decision_id: str
    decision_id: str
    payment_id: str
    action: str
    allowed: bool
    policy_rule: str
    reason: str
    created_at: datetime

class RecoveryExecutionResponse(BaseModel):
    execution_id: str
    payment_id: str
    action: str
    status: str
    result: str
    amount_recovered: float
    details: dict[str, Any]
    executed_at: datetime

class PipelineProcessResponse(BaseModel):
    payment_id: str
    event_id: str | None = None
    idempotent_duplicate: bool = False
    decision: RecoveryDecisionResponse | None = None
    policy_decision: PolicyDecisionResponse | None = None
    execution: RecoveryExecutionResponse | None = None
    escalation: dict[str, Any] | None = None
    status: str
    message: str

class PolicyConfigSchema(BaseModel):
    max_autonomous_retry_attempts: int = Field(2, ge=0, le=10)
    max_autonomous_amount: float = Field(25000.0, ge=0.0)
    require_human_high_risk: bool = True
    stop_on_repeated_failure: bool = True
    require_customer_consent_for_nudge: bool = True
    escalate_unknown_failure: bool = True
    vulcan_enabled: bool = True

class PolicySimulationRequest(BaseModel):
    proposed_config: PolicyConfigSchema
    dataset_split: str | None = "dev"  # dev, eval, or all

class PolicySimulationResponse(BaseModel):
    current_config: PolicyConfigSchema
    proposed_config: PolicyConfigSchema
    total_evaluated: int
    baseline_recovered_revenue: float
    simulated_recovered_revenue: float
    revenue_delta: float
    baseline_autonomous_recoveries: int
    simulated_autonomous_recoveries: int
    baseline_human_escalations: int
    simulated_human_escalations: int
    escalations_delta: int
    risk_exposure_change_percent: float
    projected_monthly_revenue_gain: float = 0.0
    estimated_roi_multiplier: float = 0.0
    projection_basis: str = ""
    explanation: str

class HumanReviewActionRequest(BaseModel):
    reviewer: str = "Merchant Ops Admin"
    notes: str | None = ""
    override_action: str | None = None  # if null, executes recommended action


# --- P1: Webhook Schemas ---

class WebhookSimulateRequest(BaseModel):
    gateway: str = "razorpay"  # razorpay, stripe
    event_type: str = "payment.failed"
    payment_id: str | None = None
    customer_id: str | None = None
    customer_name: str | None = "Rahul Verma"
    customer_email: str | None = "rahul.verma@example.in"
    customer_phone: str | None = "+919876543210"
    amount: float = 3499.0
    currency: str = "INR"
    payment_method: str = "card"
    error_code: str = "BAD_REQUEST_AUTHENTICATION_FAILED"
    error_description: str = "Bank network timeout during 3DS authorization"
    secret_key: str | None = None


class WebhookLogResponse(BaseModel):
    webhook_id: str
    gateway: str
    event_type: str
    event_id: str
    payment_id: str | None
    signature_valid: bool
    status: str
    pipeline_result: dict[str, Any] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- P2: Pre-Flight Schemas ---

class PreflightEvaluateRequest(BaseModel):
    merchant_id: str | None = "merch_enterprise_fashion"
    customer_id: str = "cust_rahul_9921"
    customer_name: str | None = "Rahul Verma"
    amount: float = 4500.0
    currency: str = "INR"
    payment_method: str = "upi"  # upi, card, netbanking, wallet, emi
    bank_code: str | None = "HDFC"  # HDFC, ICICI, SBI, AXIS, etc.
    upi_app: str | None = "phonepe"  # gpay, phonepe, paytm, cred


class MethodReliabilityScore(BaseModel):
    payment_method: str
    predicted_success_rate: float
    latency_ms: int
    health_status: str  # OPTIMAL, DEGRADED, OUTAGE
    recommended: bool = False


class PreflightEvaluateResponse(BaseModel):
    request_id: str
    merchant_id: str
    recommendation: str  # ALLOW, SMART_ROUTE, REORDER_METHODS, WARN_DEGRADED, BLOCK_PREVENTATIVE
    primary_method_risk: str  # LOW, MEDIUM, HIGH, CRITICAL
    success_probability: float
    predicted_latency_ms: int
    recommended_method: str
    suggested_fallback: str | None = None
    preventative_actions: list[str]
    method_rankings: list[MethodReliabilityScore]
    circuit_breaker_active: bool = False
    reasons: list[str]
    timestamp: datetime


# --- P3: Recovery Links Schemas ---

class RecoveryLinkCreateRequest(BaseModel):
    payment_id: str
    channel: str = "whatsapp"  # whatsapp, sms, email
    custom_expiry_minutes: int = 120
    discount_amount: float = 0.0
    custom_message: str | None = None


class RecoveryLinkResponse(BaseModel):
    link_id: str
    payment_id: str
    customer_id: str
    customer_name: str
    customer_phone: str
    customer_email: str
    amount: float
    currency: str
    channel: str
    short_url: str
    status: str
    discount_amount: float
    failure_reason: str
    suggested_method: str
    alternate_methods: list[str]
    message_content: str
    dpdp_consent_verified: bool
    expires_at: datetime
    completed_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class RecoveryLinkCompleteRequest(BaseModel):
    payment_method: str = "upi"
    upi_id: str | None = "customer@okhdfcbank"
    card_network: str | None = None
    notes: str | None = "Customer completed via interactive recovery link"


class RecoveryLinkCompleteResponse(BaseModel):
    link_id: str
    payment_id: str
    status: str
    amount_recovered: float
    recovery_method: str
    execution_id: str
    audit_hash: str
    message: str


# --- P4: Policy Studio & Shadow Testing Schemas ---

class StudioPolicyRuleCreateRequest(BaseModel):
    merchant_id: str | None = None
    name: str
    description: str = ""
    condition_field: str  # amount, failure_type, risk_score, retry_count, payment_method
    operator: str  # gt, gte, lt, lte, eq, neq, in
    value: str
    action: str  # RETRY, DELAYED_RETRY, PAYMENT_LINK, HUMAN_REVIEW, STOP
    priority: int = 10
    is_active: bool = True
    is_shadow: bool = False


class StudioPolicyRuleResponse(BaseModel):
    rule_id: str
    merchant_id: str | None
    name: str
    description: str
    condition_field: str
    operator: str
    value: str
    action: str
    priority: int
    is_active: bool
    is_shadow: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ShadowTestRunRequest(BaseModel):
    merchant_id: str | None = None
    sample_size: int = 100
    dataset_split: str = "dev"  # dev, eval


class ShadowTestRunResponse(BaseModel):
    run_id: str
    merchant_id: str | None
    total_evaluated: int
    decision_match_count: int
    decision_divergence_count: int
    match_rate_percent: float
    baseline_recovered_revenue: float
    shadow_recovered_revenue: float
    projected_revenue_delta: float
    baseline_escalations: int
    shadow_escalations: int
    safety_score: float
    divergences_sample: list[dict[str, Any]]
    recommendation: str
    created_at: datetime


# --- P5: Compliance Schemas ---

class ComplianceExportRequest(BaseModel):
    merchant_id: str | None = None
    organization_name: str = "RecoverAI Merchant Network"
    certifier_name: str = "Chief Compliance & Security Officer"
    include_audit_trail: bool = True
    include_dpdp_records: bool = True


class ComplianceExportResponse(BaseModel):
    certificate_id: str
    issued_to: str
    issued_by: str
    issued_at: datetime
    standard: str  # DPDP Act 2023 & RBI Guidelines
    tamper_evident_audit_seal: dict[str, Any]
    dpdp_compliance_summary: dict[str, Any]
    rbi_compliance_summary: dict[str, Any]
    digital_signature: str
    public_key_fingerprint: str
    verification_hash: str
    download_url: str | None = None


class ComplianceVerifyRequest(BaseModel):
    certificate_id: str
    verification_hash: str
    digital_signature: str


class ComplianceVerifyResponse(BaseModel):
    valid: bool
    certificate_id: str
    signed_by: str
    status: str
    verification_details: str
    tamper_check: str
