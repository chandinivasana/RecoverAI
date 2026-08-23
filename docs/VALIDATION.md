# RecoverAI — Idea Validation

Why this exact product, for this exact track, in August 2026. All sources here are public.

## 1. The track asks for precisely this system

The official Razorpay AI Buildathon page (razorpay.com/buildathon) describes **Track 3 — AI Revenue Recovery** as:

> "Build an agent that detects revenue at risk, determines the right intervention, and executes a bounded recovery workflow."

with measured recovery amounts and audit trails, spanning payment failures through overdue receivables. RecoverAI's pipeline — detect → classify → plan → policy-gate → execute/escalate/stop → measure — maps one-to-one onto that sentence.

## 2. The refusal moment is the differentiator

Across the buildathon's public materials, the judging vocabulary repeats: *bounded, gated, explainable, audit trail, honest metrics, graceful failure*. A payments company does not reward the flashiest demo; it rewards agents that can be **trusted around money**. The strongest possible demo signal is an agent that *declines* an unsafe action — visibly, with the audit log on screen. RecoverAI's deterministic policy engine makes refusal a first-class, reproducible behavior (high-ticket block, injection defense, retry-quota stop), not an accident.

## 3. "Deterministic execution, agentic analysis" is the industry-converged architecture

The emerging consensus in production agent engineering — visible across the payments/infra industry in 2026 — is that **analysis and correlation belong to AI, while execution paths stay deterministic**. That is exactly RecoverAI's core invariant:

```
AI proposes → Policy validates → System executes → Audit records → Metrics measure
```

The LLM layer (when enabled) enriches reasoning and explanations and can only *tighten* decisions; the deterministic PolicyEngine is the sole authority over execution, and it fails closed.

## 4. Vulcan makes the payment-intelligence seam timely

On 18 August 2026 Razorpay publicly launched **Vulcan** (razorpay.com/foundation-model) — India's first transformer-based payments foundation model, trained on 4B payments / 3T data points, publicly credited with 8–10% payment success-rate improvements across 51,000+ businesses. RecoverAI's `PaymentIntelligenceProvider` seam (`backend/app/core/vulcan_adapter.py`) is designed so Vulcan-class signals (success probability, routing intelligence, risk) plug in the moment participant access exists — and the simulated provider honestly labels itself as a simulation until then. We integrate only capabilities actually exposed to participants; nothing is faked.

## 5. Differentiation from Razorpay's existing products

Razorpay already ships recovery capabilities (e.g., a Subscription Recovery Agent in Agent Studio). RecoverAI deliberately does **not** compete with "payment failed → retry". Its thesis is the *decision layer*: which failures are worth acting on, which action, whether autonomy is safe, when to stop, and how much money was actually recovered — with policy gating, human escalation, and a tamper-evident audit trail. It is positioned as a focused prototype of the decision-intelligence + safe-autonomy + measurement loop, not a replacement for existing infrastructure.

## 6. Honest metrics as a feature, not a chore

"Honest metrics including false-positive cost" and an "honest exception list" are explicit judging criteria. RecoverAI's benchmark is synthetic — and says so on screen — but it is *internally sound*: outcomes are drawn from a seeded generative model independent of the planner, so recovery rate, Brier score, calibration, and the per-action confusion matrix are genuinely measured against ground truth the planner never sees. The evaluation also reports the cost of safety (recoverable revenue deliberately left on the table by escalations) — because a system that gates money must be honest about what gating costs.

## 7. The repo itself is part of the thesis

The project is built AI-first: agent-authored commits, an agent-aware repository (`AGENTS.md`, `CLAUDE.md`, `.agents/` context hub with machine-generated repo/API/test/schema maps refreshed by CI on every merge to main), spec-driven docs (`docs/PRD.md`), and CI that keeps the context truthful. The proof of success: a fresh coding agent can land in this repo with zero prior context and ship a feature end-to-end using the context files alone.

## Summary

| Judging axis | RecoverAI answer |
| --- | --- |
| Problem significance | Failed-payment revenue loss — directly tied to merchant money |
| Bounded & gated | 6-action bounded space; deterministic fail-closed PolicyEngine |
| Explainable | Structured decision summaries, refusal explanations, replay debugger |
| Audit trail | Tamper-evident SHA-256 hash-chained audit events + verify endpoint |
| Honest metrics | Seeded ground-truth benchmark, Brier/ECE, confusion matrix, exception list, disclosed as synthetic |
| Graceful failure | LLM fallback to deterministic rules; fail-closed policy engine; idempotency |
| Refusal | High-ticket block, injection defense, quota stop — the demo centerpiece |
| Appropriate AI use | LLM proposes & explains; deterministic engine decides; Vulcan-ready seam |
