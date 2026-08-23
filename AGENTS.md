# AGENTS.md — RecoverAI

Instructions for coding agents working in this repository. Read this first;
the machine-generated ground truth (repo map, full API surface, test
inventory, DB schema) lives in **`.agents/context/`** and is refreshed by CI
on every push to main — trust it over your assumptions.

## 1. The one invariant that is never violated

```
AI proposes → Policy validates → System executes → Audit records → Metrics measure
```

Any code path that executes a recovery action MUST pass through
`PolicyEngine.evaluate()` (`backend/app/policy/engine.py`). This includes
human approvals (`human_approved=True` waives escalation-class rules only —
hard rules bind even humans). The LLM layer advises and explains; it never
gates execution.

## 2. Commands (copy-pasteable)

```bash
# Backend setup + run (SQLite fallback; seeds automatically on startup)
cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# All tests (70, deterministic, no network — this must be green before merge)
cd backend && ./venv/bin/pytest -v ../tests/

# ONE test (fastest feedback loop)
cd backend && ./venv/bin/pytest ../tests/test_pipeline.py::test_full_pipeline_execution -v

# Backend lint (config in /pyproject.toml; B008 ignored — FastAPI Depends idiom)
cd backend && ./venv/bin/ruff check app seed.py ../scripts ../tests

# Frontend
cd frontend && npm install        # .npmrc handles Blade's react-native peer chain
cd frontend && npm run dev        # dev server on :3000 (backend expected on :8000)
cd frontend && npm run lint       # eslint (0 errors, 0 warnings is the bar)
cd frontend && npm run build      # ALSO the TypeScript gate — bare `tsc --noEmit`
                                  # fails before a build exists (generated types)

# Full production-shaped stack
docker compose up --build

# Refresh machine-generated agent context (CI does this on merge to main)
SEED_ON_STARTUP=false backend/venv/bin/python scripts/generate_context.py
```

## 3. Architecture in one paragraph

FastAPI backend (`backend/app/`): `agents/` (Analyst → Planner → Critic),
`policy/` (the deterministic fail-closed engine — the only execution
authority), `core/` (audit hash chain, seeded ground-truth outcome model,
idempotency, rate limiter/circuit breakers, DPDP consent, LLM reasoner,
Vulcan-ready intelligence seam), `api/` (routers). Next.js 16 frontend
(`frontend/src/`) built entirely on **@razorpay/blade** — conventions in
`.agents/frontend-blade.md`. Diagrams: [README.md](README.md) (pipeline,
policy ladder) and [ARCHITECTURE.md](ARCHITECTURE.md) (topology, state
machine, replay).

## 4. Files agents must NEVER bypass or weaken

- `backend/app/policy/engine.py` — the Policy Engine (fail-closed; hard vs escalation-class rules)
- `backend/app/core/audit.py` — ALL audit writes go through `append_audit()`; constructing `DBAuditEvent` rows directly forks/breaks the tamper-evident hash chain
- `backend/app/core/outcome_model.py` — benchmark ground truth; outcomes must NEVER derive from the planner's own predictions (that's the circularity this repo exists to avoid)
- `backend/app/core/idempotency.py` — duplicate `event_id`s must never double-execute
- `backend/app/models.py` — schema invariants (additive changes also go into `core/schema_guard.py`)

## 5. Honesty rules (these are judged features, not style)

- Never present simulated numbers as measured production data; synthetic data is labeled synthetic everywhere it surfaces (API and UI).
- Never hardcode a verdict, rate, seal, or metric in the frontend — everything judge-visible comes from API responses (red-team verdicts have a real DEFENSE FAILED branch; the audit seal is the live `/api/audit/verify` result).
- Thin experiment cohorts report `COLLECTING`, not invented counts.

## 6. Conventions

- **Commits**: Conventional Commits — `feat|fix|chore|docs|test|refactor(scope): summary`. Body explains the why; verified behavior goes in the message. Suite green before merge to `main`.
- **Python**: 3.10+ (CI/Docker pin 3.10), ruff-clean (`E,F,I,B,UP`, line 120). FastAPI + Pydantic v2 + SQLAlchemy.
- **Frontend**: Blade components/tokens only — no Tailwind, no hardcoded colors, no `var(--*)`; money via `<Amount/>` (INR, Indian digit grouping); feedback via `useToast` (never `alert()`). Full conventions: `.agents/frontend-blade.md`.
- **Currency**: INR with Indian numbering (lakhs/crores) in prose and UI.
- **Env vars**: documented in `.env.example` (single source of truth) and `.agents/deployment/README.md`. Key gotchas: `SEED_ON_STARTUP=false` keeps `app.main` import side-effect free; `NEXT_PUBLIC_API_URL` is a Docker **build** arg; `LLM_ENABLED` defaults off (CI is zero-network).

## 7. Gotchas that will bite you

- **Delete `backend/recoverai.db` after schema changes** — there is no migration tool by design; `create_all` + `core/schema_guard.py` handle additive columns only.
- Blade's `BladeProvider` latches `colorScheme` at mount (the app remounts it via a `key`); `SideNavLink` maps `href` → router `to` and does NOT forward `onClick`; Blade charts need an explicitly sized parent Box.
- Tests that batch-process payments trip the shared in-memory acquirer circuit breakers — reset them (see `_reset_acquirer_state` in `tests/test_analytics_tenancy.py`).
- `pay_dev_0001` (₹2.5L refusal) and `pay_dev_0002` (₹3,499 recovery) are reserved live-demo payments — warm start and tests must never consume them from the seeded dataset.
- The eval endpoint must stay byte-identical across runs: read-only passes use `PolicyEngine.evaluate(dry_run=True)` and never touch live breaker/counter state.

## 8. Playbooks & docs

- `.agents/feature-development/README.md` — how to add a recovery action end to end
- `.agents/testing/README.md` · `.agents/deployment/README.md` · `.agents/frontend-blade.md`
- `docs/PRD.md` (requirements) · `docs/PLAN.md` (live roadmap + verified phase outcomes) · `docs/VALIDATION.md`
