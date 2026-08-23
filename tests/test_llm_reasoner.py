"""
LLM reasoning layer tests (Phase 4). Zero network: the Anthropic client is
always faked. The properties under guard:

- LLM disabled (CI default) => DeterministicReasoner, identical legacy behavior.
- Structured outputs are schema-validated; invalid content falls back.
- ANY LLM failure degrades gracefully to the deterministic result (degraded=True).
- The critic merge is strengthen-only: the LLM can add a DISAGREE but can never
  flip a deterministic DISAGREE back to AGREE, and its overrides are limited to
  de-escalations.
- A critic STOP override flows through the pipeline to a STOPPED execution with
  an intact audit chain.
"""
import json
import os
import sys

import pytest

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.agents.critic as critic_module
from app.agents.critic import RecoveryCritic
from app.api.recovery import process_full_recovery_pipeline
from app.core.audit import verify_chain
from app.core.llm_reasoner import AnthropicReasoner, DeterministicReasoner, _reasoner_cache, get_reasoner
from app.database import Base
from app.models import DBAuditEvent, DBPayment, DBPolicyConfig, PaymentStatus, RecoveryAction

# --- Fakes -------------------------------------------------------------------

class FakeBlock:
    def __init__(self, name, input):
        self.type = "tool_use"
        self.name = name
        self.input = input


class FakeMessages:
    def __init__(self, tool_input=None, exc=None):
        self.tool_input = tool_input
        self.exc = exc

    def create(self, **kwargs):
        if self.exc:
            raise self.exc
        tool_name = kwargs["tool_choice"]["name"]
        return type("FakeResponse", (), {"content": [FakeBlock(tool_name, self.tool_input)]})()


class FakeClient:
    def __init__(self, tool_input=None, exc=None):
        self.messages = FakeMessages(tool_input, exc)


class StubLLMProvider:
    """Injected via monkeypatching critic_module.get_reasoner."""
    name = "anthropic"

    def __init__(self, verdict="AGREE", override=None, degraded=False):
        self._result = {
            "verdict": verdict,
            "notes": "stub critique",
            "suggested_override": override,
            "provider": "anthropic",
            "degraded": degraded,
            "latency_ms": 1,
        }

    def critique_plan(self, plan, payment_data, customer_context, deterministic_result):
        return self._result


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSession()
    db.add(DBPolicyConfig(
        max_autonomous_retry_attempts=2,
        max_autonomous_amount=25000.0,
        require_human_high_risk=True,
        stop_on_repeated_failure=True,
        require_customer_consent_for_nudge=True,
        escalate_unknown_failure=True,
        vulcan_enabled=True
    ))
    db.commit()
    yield db
    db.close()


def _plan(action="RETRY", prob=0.9):
    return {"recommended_action": action, "recovery_probability": prob,
            "risk_level": "LOW", "reason": "test plan"}


def _pay(amount=3000.0):
    return {"payment_id": "pay_llm", "amount": amount, "payment_method": "upi",
            "failure_reason": "Bank network timeout", "error_code": "GATEWAY_TIMEOUT",
            "retry_count": 0, "failure_type": "TEMPORARY_NETWORK_FAILURE", "risk_level": "LOW"}


# --- Provider selection ------------------------------------------------------

def test_get_reasoner_defaults_to_deterministic(monkeypatch):
    monkeypatch.delenv("LLM_ENABLED", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    _reasoner_cache["key"] = None
    reasoner = get_reasoner()
    assert isinstance(reasoner, DeterministicReasoner)
    assert reasoner.name == "deterministic"


# --- Structured output & fallback --------------------------------------------

def test_anthropic_critique_happy_path():
    reasoner = AnthropicReasoner(client=FakeClient(
        tool_input={"verdict": "DISAGREE", "notes": "too risky", "suggested_override": "STOP"}
    ))
    result = reasoner.critique_plan(_plan(), _pay(), {}, {"verdict": "AGREE", "notes": "", "suggested_override": None})
    assert result["provider"] == "anthropic"
    assert result["degraded"] is False
    assert result["verdict"] == "DISAGREE"
    assert result["suggested_override"] == "STOP"


def test_anthropic_explanation_happy_path():
    reasoner = AnthropicReasoner(client=FakeClient(
        tool_input={"narrative": "Transient bank timeout.", "contributing_factors": ["gateway health 0.72"], "confidence": 0.8}
    ))
    analysis = {"failure_type": "TEMPORARY_NETWORK_FAILURE", "risk_level": "LOW",
                "intelligence_signals": {"gateway_health_score": 0.72}, "summary": "s"}
    result = reasoner.explain_analysis(analysis, _pay(), {})
    assert result["provider"] == "anthropic"
    assert result["narrative"] == "Transient bank timeout."
    assert result["confidence"] == 0.8


def test_fallback_on_api_error_is_degraded_deterministic():
    reasoner = AnthropicReasoner(client=FakeClient(exc=TimeoutError("llm timed out")))
    det = {"verdict": "AGREE", "notes": "det notes", "suggested_override": None}
    result = reasoner.critique_plan(_plan(), _pay(), {}, det)
    assert result["degraded"] is True
    assert result["provider"] == "deterministic-fallback"
    assert result["verdict"] == "AGREE"  # deterministic content survives
    assert "TimeoutError" in result["fallback_error"]


def test_schema_rejects_widening_override_and_falls_back():
    # The model tries to override to RETRY — not a de-escalation. The schema
    # (Literal["HUMAN_REVIEW","STOP"]) must reject it, degrading to deterministic.
    reasoner = AnthropicReasoner(client=FakeClient(
        tool_input={"verdict": "DISAGREE", "notes": "x", "suggested_override": "RETRY"}
    ))
    det = {"verdict": "AGREE", "notes": "det", "suggested_override": None}
    result = reasoner.critique_plan(_plan(), _pay(), {}, det)
    assert result["degraded"] is True
    assert result["verdict"] == "AGREE"


def test_refusal_answer_deterministic_cites_rule():
    reasoner = DeterministicReasoner()
    result = reasoner.answer_refusal_question("why blocked?", {
        "review": {"amount": 250000.0, "reason": "over limit"},
        "decision": {"reason": "high ticket", "recovery_probability": 0.35},
        "policy_rule": "MAX_AUTONOMOUS_AMOUNT",
        "policy_reason": "Amount exceeds autonomous limit.",
        "config": {"max_autonomous_amount": 25000.0, "max_autonomous_retry_attempts": 2},
    })
    assert "MAX_AUTONOMOUS_AMOUNT" in result["answer"]
    assert result["cited_rules"] == ["MAX_AUTONOMOUS_AMOUNT"]
    assert result["degraded"] is False


# --- Strengthen-only critic merge --------------------------------------------

def test_llm_cannot_flip_deterministic_disagree(monkeypatch):
    # Deterministic rules DISAGREE (high-ticket RETRY); LLM says AGREE.
    monkeypatch.setattr(critic_module, "get_reasoner", lambda: StubLLMProvider(verdict="AGREE"))
    result = RecoveryCritic.critique(_plan(), _pay(amount=60000.0), {})
    assert result["verdict"] == "DISAGREE"
    assert result["suggested_override"] == RecoveryAction.HUMAN_REVIEW.value


def test_llm_disagreement_strengthens_deterministic_agree(monkeypatch):
    monkeypatch.setattr(critic_module, "get_reasoner",
                        lambda: StubLLMProvider(verdict="DISAGREE", override="STOP"))
    result = RecoveryCritic.critique(_plan(), _pay(amount=3000.0), {"past_successful_payments": 8})
    assert result["verdict"] == "DISAGREE"
    assert result["suggested_override"] == RecoveryAction.STOP.value
    assert result["llm"]["enabled"] is True


def test_invalid_stub_override_normalized_to_human_review(monkeypatch):
    # Defense-in-depth: even if a provider returned a widening override, the
    # critic normalizes it to HUMAN_REVIEW.
    monkeypatch.setattr(critic_module, "get_reasoner",
                        lambda: StubLLMProvider(verdict="DISAGREE", override="RETRY"))
    result = RecoveryCritic.critique(_plan(action="DELAYED_RETRY"), _pay(amount=3000.0), {})
    assert result["verdict"] == "DISAGREE"
    assert result["suggested_override"] == RecoveryAction.HUMAN_REVIEW.value


def test_degraded_llm_leaves_deterministic_verdict_untouched(monkeypatch):
    monkeypatch.setattr(critic_module, "get_reasoner",
                        lambda: StubLLMProvider(verdict="DISAGREE", override="STOP", degraded=True))
    result = RecoveryCritic.critique(_plan(), _pay(amount=3000.0), {"past_successful_payments": 8})
    assert result["verdict"] == "AGREE"  # degraded LLM opinion is ignored
    assert result["llm"]["degraded"] is True


# --- Pipeline integration -----------------------------------------------------

def test_critic_stop_override_flows_to_stopped_execution(test_db, monkeypatch):
    monkeypatch.setattr(critic_module, "get_reasoner",
                        lambda: StubLLMProvider(verdict="DISAGREE", override="STOP"))
    payment = DBPayment(
        payment_id="pay_llm_stop",
        customer_id="cust_llm",
        customer_name="LLM Stop",
        amount=3499.0,
        currency="INR",
        payment_method="upi",
        status=PaymentStatus.FAILED.value,
        failure_reason="Bank network timeout",
        error_code="GATEWAY_TIMEOUT",
        retry_count=0,
        ground_truth_recoverable=True,
        ground_truth_prob=0.9,
        outcome_seed=7,
        metadata_json=json.dumps({"past_successful_payments": 10, "risk_score": 0.05, "has_messaging_consent": True})
    )
    test_db.add(payment)
    test_db.commit()

    res = process_full_recovery_pipeline("pay_llm_stop", test_db)

    assert res["decision"]["critic_override_applied"] is True
    assert res["decision"]["action"] == RecoveryAction.STOP.value
    assert res["execution"]["status"] == "STOPPED"
    assert res["execution"]["amount_recovered"] == 0.0

    override_audit = test_db.query(DBAuditEvent).filter(
        DBAuditEvent.event_type == "CRITIC_OVERRIDE_APPLIED").first()
    assert override_audit is not None
    assert verify_chain(test_db)["intact"] is True
