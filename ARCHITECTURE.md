# RecoverAI System Architecture

## Architecture Diagram

```
                 +-----------------------------------+
                 |           Merchant UI             |
                 |   Next.js 14 + Tailwind + Lucide  |
                 +-----------------+-----------------+
                                   | REST / SSE
                                   v
+----------------------------------+------------------------------------+
|                         FastAPI Core API                              |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  |                 Idempotency & Ingestion Layer                   |  |
|  +--------------------------------+--------------------------------+  |
|                                   |                                   |
|                                   v                                   |
|  +--------------------------------+--------------------------------+  |
|  |             Payment Analyst (Failure Intelligence)              |  |
|  |     - Categorization & Context Retrieval                        |  |
|  |     - Vulcan Intelligence Adapter (Pluggable Provider)          |  |
|  +--------------------------------+--------------------------------+  |
|                                   |                                   |
|                                   v                                   |
|  +--------------------------------+--------------------------------+  |
|  |             Recovery Planner (Bounded Action Selection)         |  |
|  |     - Expected Net Recovery Optimization                        |  |
|  |     - Risk & Probability Scoring                                |  |
|  +--------------------------------+--------------------------------+  |
|                                   |                                   |
|                                   v                                   |
|  +--------------------------------+--------------------------------+  |
|  |            [OPTIONAL] Critic / Second Opinion Layer             |  |
|  +--------------------------------+--------------------------------+  |
|                                   |                                   |
|                                   v                                   |
|  +=================================================================+  |
|  |               DETERMINISTIC POLICY ENGINE (FAIL-CLOSED)         |  |
|  |  - Max Autonomous Amount Limit (e.g. ₹25,000)                   |  |
|  |  - Max Autonomous Retry Attempts (e.g. 2)                      |  |
|  |  - High Risk / Prompt Injection Refusal                         |  |
|  |  - Customer Consent & Communication Rules                       |  |
|  +================================+================================+  |
|                                   |                                   |
|            +----------------------+----------------------+            |
|            |                      |                      |            |
|    [ALLOWED: EXECUTE]     [BLOCKED: ESCALATE]     [BLOCKED: STOP]     |
|            |                      |                      |            |
|            v                      v                      v            |
|  +-------------------+  +-------------------+  +-------------------+  |
|  | Recovery Executor |  | Human Review Queue|  | No Action Taken   |  |
|  +---------+---------+  +---------+---------+  +---------+---------+  |
|            |                      |                      |            |
|            +----------------------+----------------------+            |
|                                   |                                   |
|                                   v                                   |
|  +--------------------------------+--------------------------------+  |
|  |              Immutable Audit Trail & Metrics Store              |  |
|  |               SQLite / SQLAlchemy / PostgreSQL                  |  |
|  +-----------------------------------------------------------------+  |
+-----------------------------------------------------------------------+
```

## Key Invariants
1. **No AI Direct Execution**: The AI outputs recommendations only. Execution is gated by `PolicyEngine`.
2. **Deterministic Precedence**: If AI claims high confidence but Policy rules block the transaction, the decision is strictly `BLOCKED_BY_POLICY`.
3. **Idempotency Guarantee**: Ingesting the same `event_id` returns `ALREADY_PROCESSED` without double-execution.
4. **Complete Auditability**: Every state transition emits an immutable `AuditEvent`.
