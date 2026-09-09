# S5 — Forecast Engine 🔴 AI-Free Zone

No file in this directory may import an AI provider **or the S11 AI service**.
`npm run lint` fails the build if one does.

Why the rule is absolute: a user who sees ฿12,400 today and ฿12,800 tomorrow
with unchanged data stops trusting the number, and never comes back. Identical
inputs must always yield byte-identical output — that property is what the
determinism test (100 runs) exists to prove.

AI may _narrate_ what this module computes (S11 T4). It may never compute,
adjust, or override a value here.

Before touching anything in here, read AIDO §11.3.
