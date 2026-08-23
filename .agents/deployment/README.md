# Deployment Guidelines

## Docker Deployment (the canonical path)

```bash
docker compose up --build
```

Brings up 4 services with health-gated ordering: `postgres` → `redis` → `backend`
(healthcheck on `/health`; generous start period because first boot seeds 1,000
synthetic payments and warm-starts the recovery pipeline) → `frontend`.

Copy `.env.example` to `.env` to override any of the defaults below.

## Environment Configuration (single source of truth: `.env.example`)

Backend:
- `DATABASE_URL` — `sqlite:///./recoverai.db` locally; compose injects Postgres.
- `REDIS_URL` — rate limiter / circuit breaker state; transparent in-memory fallback when absent.
- `CORS_ORIGINS` — comma-separated browser origins (no wildcards; credentials mode).
- `SEED_ON_STARTUP` (`true`) — seed the synthetic dataset at boot. CI/tooling set `false` so importing `app.main` is side-effect free.
- `DEMO_WARM_START` (`false`; `true` in compose) — batch-process ~150 dev payments at boot so dashboards are non-zero. Never consumes the reserved demo payments `pay_dev_0001`/`pay_dev_0002`.
- `LLM_ENABLED` + `ANTHROPIC_API_KEY` + `LLM_MODEL` — the advisory LLM reasoning layer. Off by default; every failure degrades to deterministic reasoning (audited as `LLM_FALLBACK`). The LLM never gates execution.
- `POSTGRES_PASSWORD` — compose DB credential (override outside local demos).

Frontend:
- `NEXT_PUBLIC_API_URL` — **build-time** arg (inlined into the client bundle;
  runtime env does nothing). Must be reachable from the user's browser —
  compose maps the backend to `http://localhost:8000`.
- `frontend/.npmrc` sets `legacy-peer-deps=true` (required for `npm ci` with
  Blade's react-native peer chain) and is copied into the Docker build.

## Schema changes

No migration tool by design (demo-scale): `Base.metadata.create_all` plus the
additive column guard in `backend/app/core/schema_guard.py`. After destructive
schema changes, delete `backend/recoverai.db` (or the `pgdata` volume) and let
the seeder rebuild.
