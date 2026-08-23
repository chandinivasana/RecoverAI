@AGENTS.md

## Claude-specific deltas
- **Safety priority**: when uncertain, escalate to a human or stop — never perform unapproved autonomous financial actions, in code or in demos.
- Any code path attempting recovery MUST pass through `PolicyEngine.evaluate()`; treat the never-bypass list in AGENTS.md §4 as hard constraints.
- Currency: INR (₹) with Indian numbering (lakhs/crores).
