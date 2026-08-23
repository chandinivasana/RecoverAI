import enum
from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, Enum as SQLEnum, ForeignKey
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


# --- Pydantic API Schemas ---

class CustomerContext(BaseModel):
    customer_id: str
    customer_name: Optional[str] = "Anonymous"
    tenure_months: Optional[int] = 6
    lifetime_value: Optional[float] = 10000.0
    past_successful_payments: Optional[int] = 5
    past_failed_payments: Optional[int] = 1
    preferred_payment_method: Optional[str] = "upi"
    last_successful_payment_days_ago: Optional[int] = 3
    risk_score: Optional[float] = 0.1
    has_messaging_consent: Optional[bool] = True

class PaymentEventIngestRequest(BaseModel):
    event_id: str
    payment_id: str
    customer_id: str
    customer_name: Optional[str] = "Anonymous"
    customer_email: Optional[str] = ""
    customer_phone: Optional[str] = ""
    amount: float
    currency: str = "INR"
    payment_method: str
    failure_reason: str
    error_code: Optional[str] = "GENERIC_ERROR"
    timestamp: Optional[str] = None
    customer_context: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None

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
    signals: Dict[str, Any]
    critic_verdict: Optional[str] = "AGREE"
    critic_notes: Optional[str] = ""
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
    details: Dict[str, Any]
    executed_at: datetime

class PipelineProcessResponse(BaseModel):
    payment_id: str
    event_id: Optional[str] = None
    idempotent_duplicate: bool = False
    decision: Optional[RecoveryDecisionResponse] = None
    policy_decision: Optional[PolicyDecisionResponse] = None
    execution: Optional[RecoveryExecutionResponse] = None
    escalation: Optional[Dict[str, Any]] = None
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
    dataset_split: Optional[str] = "dev"  # dev, eval, or all

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
    notes: Optional[str] = ""
    override_action: Optional[str] = None  # if null, executes recommended action
