"""
Structured-output contracts for the LLM reasoning layer.

These schemas are the safety boundary on what the LLM may say:
- A critique verdict is strictly AGREE/DISAGREE and its override is strictly
  limited to de-escalations (HUMAN_REVIEW / STOP). The model literally cannot
  emit an instruction that widens the action space — anything else fails
  validation and falls back to the deterministic result.
- The LLM never gates execution regardless: the deterministic PolicyEngine
  remains the only authority over money movement.
"""
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class LLMCritique(BaseModel):
    verdict: Literal["AGREE", "DISAGREE"]
    notes: str = Field(..., max_length=600)
    suggested_override: Optional[Literal["HUMAN_REVIEW", "STOP"]] = None


class LLMExplanation(BaseModel):
    narrative: str = Field(..., max_length=900)
    contributing_factors: List[str] = Field(default_factory=list, max_length=5)
    confidence: float = Field(..., ge=0.0, le=1.0)


class LLMRefusalAnswer(BaseModel):
    answer: str = Field(..., max_length=1400)
    cited_rules: List[str] = Field(default_factory=list, max_length=6)
