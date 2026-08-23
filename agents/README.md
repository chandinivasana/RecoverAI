# agents/ — root proxy package

The real agent implementations live in [`backend/app/agents/`](../backend/app/agents/):

- `payment_analyst.py` — failure classification & signal extraction
- `recovery_planner.py` — bounded action selection & expected net recovery
- `critic.py` — second-opinion pass (de-escalation only)
- `recovery_executor.py` — policy-gated simulated execution

This package only re-exports them for convenience when importing from the repo root. Make all changes in `backend/app/agents/`.
