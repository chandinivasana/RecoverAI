# policy/ — root proxy package

The real policy implementation lives in [`backend/app/policy/`](../backend/app/policy/):

- `engine.py` — the deterministic, fail-closed PolicyEngine (the ONLY authority over execution)
- `rules.py` — individual policy rule checks

This package only re-exports them for convenience when importing from the repo root. Make all changes in `backend/app/policy/`. Coding agents must never bypass or weaken `PolicyEngine.evaluate()`.
