# RecoverAI — Engineering Roadmap & Change Plan

> The living reference for what has been done, what is in flight, and what comes next.
> Every phase lands as a conventional-commit series on a feature branch merged to `main`, with the full test suite green before merge.
> Keep this document updated at the end of every phase — future agents and humans use it to decide what to do next.

## Guiding rubric (what the project is judged on)

From the official Razorpay AI Buildathon Track 3 description and program page (razorpay.com/buildathon):

> "Build an agent that detects revenue at risk, determines the right intervention, and executes a **bounded** recovery workflow" — with **measured money recovered**, **compliant escalation**, **stopping rules**, and an **audit trail**.

Recurring judging vocabulary across all tracks: *bounded, gated, explainable, audit trail, honest metrics, graceful failure, held-out data, honest exception list*. The single most differentiating demo moment: **the agent refusing an unsafe action**, with the audit log visible.

Core invariant (never violated by any change):

```
AI proposes → Policy validates → System executes → Audit records → Metrics measure
```

## Phase status board

| # | Phase | Status | Outcome |
| --- | --- | --- | --- |
| 0 | Git baseline + repo hygiene (`/docs`, LICENSE, badges, PRD as markdown, stub-package fix) | ✅ Done | Local git history started; docs live in-repo |
| 1 | Ground-truth benchmark — kill circular metrics | ✅ Done | Measured on held-out eval: Brier 0.2168, ECE 0.0979, FP cost ₹4.61L surfaced, leakage measured ₹0, 12 recoverable payments (₹3.05L) honestly reported as gated by safety. Eval byte-identical across runs. 29/29 tests. |
| 2 | Policy integrity (human-approve re-validation, consequential Critic, fail-closed consent, live circuit breaker, red-team honesty) | ✅ Done | Approvals re-validate via `human_approved=True` (hard rules bind even humans — verified live: injection approval → 409, ₹85k sign-off → HUMAN_SIGN_OFF_WITHIN_HARD_LIMITS). Critic override consequential + audited. Consent fails closed for unknown customers. Breaker tripped 9× in warm start, audited. All 5 red-team verdicts earned (quota scenario now forces RETRY → MAX_RETRY_LIMIT). 43/43 tests. |
| 3 | Tamper-evident audit chain (SHA-256 hash chain + `/api/audit/verify`) | ✅ Done | All 14 audit call sites route through `core/audit.py::append_audit`; chain verified live (309 events intact after warm start); direct SQLite tamper of row 42 detected at exactly position 42 (CONTENT_MISMATCH); deletion detection (LINKAGE_BROKEN) tested; vacuous AC-9 replaced with tamper-and-detect; wording sweep "cryptographic/immutable" → "tamper-evident SHA-256 hash chain". 46/46 tests. |
| 4 | LLM reasoning layer (feature-flagged, deterministic fallback, refusal Q&A) | ✅ Done | `core/llm_reasoner.py` provider seam (Anthropic behind `LLM_ENABLED`+key; forced tool-use, schema-validated). Strengthen-only critic merge (LLM can never loosen). `POST /api/reviews/{id}/explain` Q&A + UI drawer with provider badge. Verified live with a broken key: Q&A and full pipeline keep working via deterministic fallback, `AuthenticationError` captured in 3 audited LLM_FALLBACK events, chain intact. Frontend build green. 57/57 tests (zero network in CI). |
| 5 | Honest analytics + real multi-tenant filtering | ✅ Done | Hardcoded A/B literals (175/74…) deleted — cohorts computed from executions joined via new `decision_id` column, chi² on real counts, honest COLLECTING status for small cohorts, synthetic-data disclosure on responses. `DBPayment.merchant_id` assigned deterministically; KPIs/timeseries/strategies/payments genuinely filter (verified live: 419+374+207=1000 txns, sums exact to the paisa). Merchant profiles report live metrics. MerchantSwitcher fetches live data + All-Merchants view. Helpers deduped into `core/utils.py` + `core/config_store.py`. 63/63 tests; frontend build green. |
| 6 | **Blade migration** + frontend truth (rebuild UI on @razorpay/blade to match the Razorpay dashboard, using the Blade MCP knowledge base; plus RedTeam verdicts, honest labels, toasts, dark mode via Blade colorScheme) | ✅ Done | All 11 feature components + shell (Blade TopNav/SideNav per the canonical Dashboard pattern) migrated by an 11-agent fleet driven by the Blade MCP knowledge base; lucide/recharts/tailwind fully removed. Verified live in the browser: dashboard KPIs/chart/tables, review Q&A end-to-end, evaluation disclosure banner, red-team earned verdict with adversarial narrative (AI proposed → adversary forced → wall blocked), full dark-mode retheme, responsive mobile shell. Gates: tsc 0 errors, eslint 0 errors/0 warnings, production build green. |
| 7 | Backend/deploy hygiene (CORS, env, Docker build args) | ⏳ Planned | |
| 8 | Mermaid diagrams + docs rewrite (honest claims everywhere) | ⏳ Planned | |
| 9 | CI upgrade + auto-refreshing `.agents/context/` on merge to main | ⏳ Planned | |

## Phase details

### Phase 0 — Git baseline + repo hygiene ✅
- `git init` on `main`; baseline import commit; all subsequent work in conventional commits.
- MIT `LICENSE` added (README already claimed MIT).
- Misnamed binary `prd.md` (a PDF) replaced by real markdown `docs/PRD.md`; project docs consolidated under `/docs`.
- README badges corrected (no links to repos/services that don't exist yet).
- Root proxy packages `agents/`, `policy/`, `evaluation/` had a broken `sys.path` (pointed at `./backend` relative to themselves); fixed to `../backend` and given pointer READMEs.
- `.gitignore` extended (`.env`).

### Phase 1 — Ground-truth benchmark (kill the circular metrics) 🔄
**Problem:** evaluation defined "actual outcome" as the planner's own thresholded prediction (`prob >= 0.5`), making Brier/calibration self-referential; executor success used the same rule; A/B-style projections used magic constants.

**Fix:**
- New `backend/app/core/outcome_model.py` — a seeded generative model of *latent recoverability*, independent of the planner: `assign_ground_truth()` (per-payment RNG stream keyed by `GT_SEED=20260823`) conditioned on failure category, amount, and customer signals; `simulate_action_outcome()` — pure, reproducible, keyed by `(outcome_seed, action)` with a per-(failure, action) effectiveness table.
- `DBPayment` gains `ground_truth_recoverable`, `ground_truth_prob`, `outcome_seed` (nullable; lazily assigned for ad-hoc payments).
- Executor, evaluation, and policy simulation all consume `simulate_action_outcome(...)` — the planner's probability is now a genuine *prediction of an external quantity*.
- Evaluation reports: real Brier + expected calibration error, per-action confusion matrix, capped `honest_exceptions` list (false positives/negatives with amounts), `missed_recoverable_in_escalations` (the honest cost of safety), *measured* (not asserted) unsafe financial leakage, and a `benchmark_disclosure` string stating the benchmark is synthetic and seeded.
- Seeders consolidated: `backend/seed.py` becomes a thin CLI shim over `app/core/seed_data.py`; seeding moves from import time to a lifespan handler gated by `SEED_ON_STARTUP`; `DEMO_WARM_START` batch-processes a slice of dev payments so a fresh Docker boot shows real non-zero dashboards.
- Determinism: `PolicyEngine.evaluate(dry_run=True)` for evaluation/simulation/replay so read-only passes don't increment acquirer rate-limit counters.
- Tests: fixture updates for AC-8 and the full-pipeline test; new `tests/test_ground_truth.py` (determinism, planner-independence, Brier > 0, byte-identical eval runs).

### Phase 2 — Policy integrity
- `approve_review` re-validates through `PolicyEngine.evaluate(..., human_approved=True)`: human sign-off waives *escalation-class* rules only (amount cap, high risk, unknown failure); *hard* rules (injection defense, retry limit, consent, acquirer breaker) still block. Validate `override_action` against the bounded enum. Remove the hardcoded success probability.
- Make the Critic consequential: a DISAGREE with suggested override in {HUMAN_REVIEW, STOP} de-escalates the plan before policy evaluation (+ `CRITIC_OVERRIDE_APPLIED` audit event). De-escalation only.
- Consent registry genuinely fails closed for unknown customers; class typo fixed (`DPDPConsentRegistry`).
- Circuit breaker actually trips on repeated acquirer failures.
- Red-team scenarios evaluate the *adversary-forced* action so verdicts are earned, not assumed.

### Phase 3 — Tamper-evident audit chain
- `DBAuditEvent` += `prev_hash`, `entry_hash` (SHA-256 over canonical payload + previous hash); single `core/audit.py::append_audit()` helper replaces all ad-hoc audit writes; `GET /api/audit/verify` walks the chain and reports the first broken link; `test_ac9` rewritten to tamper-and-detect. Wording everywhere: "tamper-evident SHA-256 hash chain" (never "cryptographic immutability").

### Phase 4 — LLM reasoning layer (never gating)
- `core/llm_reasoner.py`: `DeterministicReasoner` (always available) + `AnthropicReasoner` (env-gated: `LLM_ENABLED`, `ANTHROPIC_API_KEY`, `LLM_MODEL`, hard timeout). Structured outputs via forced tool-use; every failure falls back deterministically with `degraded: true` + an `LLM_FALLBACK` audit event — the graceful-failure demo.
- Hooks: Critic (strengthen-only: LLM can never flip DISAGREE→AGREE; overrides schema-limited to HUMAN_REVIEW/STOP), analyst narrative enrichment (never mutates classification), and `POST /api/reviews/{id}/explain` — conversational "explain this refusal" for reviewers.
- Payment data is wrapped as untrusted input; the deterministic PolicyEngine remains the only execution gate. CI runs with the LLM disabled — fully deterministic.

### Phase 5 — Honest analytics + real multi-tenant
- A/B experiment cohorts computed from actual executions (scipy chi² on real counts; `COLLECTING` status for small cells; labeled synthetic).
- `DBPayment.merchant_id` + filter threading through KPIs/timeseries/strategies/payments and the frontend — the Merchant Switcher actually isolates tenants.
- Shared helpers deduplicated (`core/utils.py`, `core/config_store.py`).

### Phase 6 — Blade migration + frontend truth (amended per user direction, Aug 23)
**The frontend is rebuilt on `@razorpay/blade` — Razorpay's production design system — so the product looks like the Razorpay dashboard and can be integrated into it with minimal friction.** This is the org-standard path: Razorpay teams ship production UI by building with the Blade MCP (`@razorpay/blade-mcp`); its bundled knowledge base (component docs, the canonical Dashboard TopNav+SideNav pattern, chart color system) drives this migration.

- Foundation: `BladeProvider` + `bladeTheme` tokens + Blade fonts + styled-components v5 SSR registry for the Next App Router (`frontend/src/lib/AppProviders.tsx`, `StyledComponentsRegistry.tsx`); `.npmrc` `legacy-peer-deps=true` (Blade ships react-native peers irrelevant to web); dark mode via Blade `colorScheme` (light-first, like the real dashboard).
- App shell rebuilt on Blade `TopNav` + `SideNav` following the canonical Dashboard pattern.
- All feature components migrated to Blade primitives (Card, Table, Amount, Badge, Alert, Modal/Drawer, Toast, charts) — no hand-rolled token look-alikes.
- Frontend-truth fixes folded into the migration: RedTeamLab conditional red/green verdicts; PolicySimulator drops invented `*3.75`/`14.2` fallbacks and shows `projection_basis`; EvaluationView synthetic-benchmark disclosure + honest-exceptions table + Brier/ECE; AuditReportModal wires the real `/api/audit/verify` result instead of a hardcoded seal; ABExperimentWidget via `lib/api.ts` (kills hardcoded localhost) with honest COLLECTING states; honest "Auto-refresh" labeling; TimeTravelReplay renders the critic stage; `alert()` → Blade `useToast`; tab title fixed; responsive shell.

### Phase 7 — Backend/deploy hygiene
Env-driven CORS; secrets via `.env`; `NEXT_PUBLIC_API_URL` as a Docker **build** arg; complete `.env.example`; SPEC.md matches the real API surface.

### Phase 8 — Diagrams + docs rewrite
Five Mermaid diagrams (hero pipeline, container topology, payment state machine, policy gate ladder, replay comparison); README rewritten with honest metrics language and accurate quickstart.

### Phase 9 — CI + auto-refreshing agent context
- `scripts/generate_context.py` (deterministic) → `.agents/context/{repo-map,api-surface,test-inventory,db-schema}.md`.
- `context-refresh.yml`: on every push to `main`, regenerate and bot-commit context (`[skip ci]` loop guard) — the repo keeps itself explainable to fresh agents.
- `ci.yml`: ruff, pytest (incl. API integration tests), eslint + `tsc --noEmit`, frontend build, docker build, PR-only context-freshness check; dependency caching throughout.
- `AGENTS.md` rewritten to best practice (copy-pasteable commands, single-test syntax, commit conventions, security boundaries); `CLAUDE.md` = `@AGENTS.md` + deltas.

## Deferred / follow-ups (not in this pass)
- GitHub remote, branch protection, and PR flow against origin (currently local-only by request).
- AWS deployment (US$100 credits available) — after the system is verified locally.
- SSE streaming for the activity feed (honest polling label in the meantime).
- Pitch-video recording — script beats map 1:1 to shipped features: refusal → human approval that still can't bypass hard rules → audit chain verification → honest held-out evaluation → live LLM fallback.

## Working agreements
- Never merge with a red test suite; every phase adds or strengthens tests.
- Never present simulated numbers as measured production data — label synthetic data as synthetic.
- Any code path that executes a recovery action MUST pass through `PolicyEngine.evaluate()`.
- Verify file paths/line numbers against the actual tree before claiming or changing them.
