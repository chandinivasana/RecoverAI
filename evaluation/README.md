# evaluation/ — root proxy package

The real evaluation implementation lives in [`backend/app/api/evaluation.py`](../backend/app/api/evaluation.py) (held-out benchmark runner) with the seeded ground-truth outcome model in [`backend/app/core/outcome_model.py`](../backend/app/core/outcome_model.py).

This package only re-exports `run_evaluation_benchmark` for convenience when importing from the repo root. Make all changes in `backend/app/`.
