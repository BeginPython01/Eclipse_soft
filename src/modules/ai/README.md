# S11 — AI Service

The only directory in the repository permitted to import an AI provider SDK.

Nothing here may be called before Week 9 (SPEC §5): the rule-based paths must be
proven first, or AI becomes an expensive crutch masking weak fundamentals.

Every task passes the full Guard Layer in order — ai_enabled → cache → rate
limit → budget breaker → PII redaction → provider call → Zod validation →
sanity checks → usage log. See AIDO §7 and §11.4.
