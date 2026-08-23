"""
Root level proxy for evaluation module.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "backend")))

from app.api.evaluation import run_evaluation_benchmark

__all__ = ["run_evaluation_benchmark"]
