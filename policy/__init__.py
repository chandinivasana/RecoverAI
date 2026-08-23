"""
Root level proxy for policy module.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.policy.rules import PolicyRules, PolicyEvaluationResult
from app.policy.engine import PolicyEngine

__all__ = ["PolicyRules", "PolicyEvaluationResult", "PolicyEngine"]
