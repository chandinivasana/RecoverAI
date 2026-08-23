# Testing Guidelines for Coding Agents

## Invariants to verify:
1. Every payment recovery recommendation MUST pass through `PolicyEngine.evaluate()`.
2. Duplicate event IDs MUST be rejected by Idempotency check.
3. Transactions exceeding merchant policy autonomous limit (default ₹25,000) MUST NOT be executed autonomously.
4. Attacks containing Prompt Injections in failure reasons MUST be blocked or escalated.
5. All test runs must produce deterministic results on held-out evaluation sets.
