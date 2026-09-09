# จดตัง (Jodtang)

> **"เงินจะพอใช้ถึงสิ้นเดือนไหม?"**

A personal finance app that answers exactly one question. Log expenses in three
seconds through LINE chat (`กาแฟ 80`) or let K PLUS bank emails flow in
automatically, and a deterministic forecast engine projects your **end-of-month**
balance, daily safe-to-spend, shortfall probability, and runway date.

**Status:** Week 1 — foundation scaffold. The forecast engine, parsers, and AI
service are not implemented yet; see the roadmap below.

> ⚠️ Experimental / educational project. Non-commercial, THB only, not
> financial advice.

---

## Why

Most personal finance apps fail for two reasons:

1. **Manual entry fatigue** — users abandon logging within 2–3 weeks.
2. **Backward-looking only** — they show where money _went_, not whether money
   _will last_.

Jodtang attacks both: near-zero input friction, and a forward-looking forecast
as the primary screen.

## Three pillars

| Pillar                           | What it means                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **A — Near-zero input friction** | Type `กาแฟ 80` in LINE, or forward K PLUS emails and never type at all                                                           |
| **B — Actionable forecasting**   | "Projected balance on Sep 30: ฿48,200. Safe to spend ฿2,910/day."                                                                |
| **C — AI as a safety net**       | AI absorbs messy edges (free-form Thai, cryptic merchant codes, changed email templates) — **without ever touching the numbers** |

---

## Architecture

Hybrid: a LINE Bot for capture and notifications, plus a browser app for
dashboards and analysis. Both share **one backend, one database, one identity**
(`line_user_id`).

| Surface  | Responsibility                                  |
| -------- | ----------------------------------------------- |
| LINE Bot | Fast capture, quick summary, push notifications |
| Web app  | Dashboard, charts, simulation, settings         |

### Modules

| ID  | Module                                             | AI allowed?            |
| --- | -------------------------------------------------- | ---------------------- |
| S1  | LINE Gateway — webhook verification, event routing | ❌                     |
| S2  | Web Frontend — Next.js App Router surfaces         | ❌                     |
| S3  | Core API — auth, transactions, budgets, users      | ❌                     |
| S4  | Text Parser — four-layer Thai text cascade         | ⚠️ L4 only             |
| S5  | Forecast Engine — EOM projection                   | 🔴 never               |
| S6  | Database — PostgreSQL schema                       | ❌                     |
| S7  | Scheduler — cron jobs, recurring materialization   | ❌                     |
| S8  | Email Ingestion — Cloudflare Email Worker          | ❌                     |
| S9  | Bank Parser — K PLUS extraction (R1 regex / R2 AI) | ⚠️ R2 fallback         |
| S10 | Reconciliation — dedup, transfer detection         | 🔴 never               |
| S11 | AI Service — the only place model calls exist      | ✅                     |
| S12 | LINE AI Chatbot — conversation layer only          | ⚠️ delegates to S11 T5 |

> **S12 is not yet ratified.** `AIDO.md` specifies it; `SPEC.md` — the source of
> truth — does not yet carry a matching section. Until that is resolved, treat
> S12 and AI task T5 as proposed, not committed. See _Open decisions_ below.

---

## Two design decisions worth knowing up front

### 1. AI never computes money

The forecast engine and reconciliation are strict **AI-free zones**. Every
number that affects a balance or a projection comes from deterministic code
with reproducible output — identical inputs must always yield identical
results. AI may _narrate_ a forecast; it may never compute, adjust, or override
a value.

The definitive test: **with `AI_ENABLED=false`, every P0 feature still works.**

This is enforced mechanically, not by memory — `npm run lint` fails the build if
any file outside `src/modules/ai/` imports an AI provider, or if
`src/modules/forecast/` or `src/modules/reconcile/` import the AI service at all.

### 2. Rules first, AI last, cache always

Both parsers escalate through cheap deterministic tiers before spending a
single satang on a model call.

**Text parsing (S4)** — AI handles roughly the last 5%:

| Layer | Method                      | Coverage | Cost |
| ----- | --------------------------- | -------- | ---- |
| L1    | Regex (amount + sign)       | ~60%     | Free |
| L2    | Thai keyword dictionary     | +25%     | Free |
| L3    | Per-user learned dictionary | +10%     | Free |
| L4    | AI fallback (S11 T1)        | ~5%      | Paid |

L4 runs only when L1–L3 return confidence < 0.6 or fail to find an amount. When
a user confirms an L4 result, the keyword→category mapping is promoted into
their dictionary — **the same phrase never reaches L4 twice**, so the system
gets cheaper and faster with use.

**Bank email parsing (S9)** — R1 regex first; R2 (AI) only when R1 fails or
returns incomplete data, which keeps ingestion alive while a new regex rule is
written.

---

## The AI Service (S11)

Every model call in the system goes through one gateway. No other module may
call a provider directly — enforced by lint rule and CI.

```
① GUARD LAYER   ai_enabled? → cache lookup → rate limit (20/user/day)
                → monthly budget breaker → mandatory PII redaction
② TASK ROUTER   T1 parseTransactionText  (← S4 L4)
                T2 normalizeMerchant     (← S9)
                T3 extractFromEmail      (← S9 R2)
                T4 generateInsight       (← S3/S7, and the `เหลือ` command)
③ PROVIDER ADAPTER   swappable, env-driven — no SDK lock-in
④ VALIDATOR + FALLBACK   Zod schema → sanity ranges
                → deterministic fallback on failure → always log usage
```

**T2 is the highest-ROI task.** `"POS 7-11 SUKHUMV 42"` → `7-Eleven / ของใช้`,
written to a _global_ merchant dictionary: one call benefits every user
forever, with an expected cache hit rate above 90% after the first month.

AI output is always validated against a Zod schema, always range-checked, and
AI-extracted transactions always land as `pending` for human confirmation.
Anything AI-produced in the UI carries a visible ✨ badge and the disclaimer
_"ข้อมูลเชิงวิเคราะห์ ไม่ใช่คำแนะนำทางการเงิน"_.

Total AI spend is hard-capped at **80 THB/month**, in code _and_ in the
provider dashboard.

---

## Forecast engine (S5)

**Level 1 — deterministic (required)**

```
B_EOM = B_now + Σ R_in − Σ R_out − (d̃ × D)
```

`d̃` is the **median** daily non-recurring spend (not the mean); `D` is days
remaining until the last day of the current calendar month; recurring sums
count remaining _occurrences_, not naive monthly multiples.

**Level 1.5 — daily safe-to-spend (required)**

```
Safe_to_spend_per_day = ( B_now + Σ R_in − Σ R_out − buffer ) ÷ D
```

`buffer` is a user-configurable minimum balance floor (default ฿0). A negative
result is an immediate over-budget warning — the user does not have to wait
until month-end to see the shortfall. Reuses the exact inputs Level 1 already
computed; no extra queries, no AI.

**Level 2 — seasonality (required)** applies the current month's factor
(Thailand defaults: Apr 1.15, Nov 1.10, Dec 1.25, else 1.00), replaced by
learned factors after 12 months of history.

**Level 3 — Monte Carlo (P2)** runs 5,000 iterations from a log-normal fit to
produce P10/P50/P90 and a fan chart.

Confidence is always visible, and honest about cold start:

| Data age  | Method                      | Confidence     |
| --------- | --------------------------- | -------------- |
| 0–6 days  | Recurring only              | 🔴 Preliminary |
| 7–29 days | Recurring + partial average | 🟡 Medium      |
| 30+ days  | Full formula + seasonality  | 🟢 High        |

---

## Chat commands

| Input              | Action                                                                |
| ------------------ | --------------------------------------------------------------------- |
| `กาแฟ 80`          | Log an expense                                                        |
| `+เงินเดือน 35000` | Log income                                                            |
| `สรุป`             | Monthly summary (Flex)                                                |
| `เหลือ`            | Balance + EOM forecast + daily safe-to-spend, narrated in Thai via T4 |
| `วิเคราะห์`        | AI insight (rate-limited)                                             |
| `ช่วยเหลือ`        | Usage guide                                                           |

Every parse replies with ✅ ถูกต้อง / ✏️ แก้หมวด buttons. Corrections are the
training signal for the learned dictionary.

For `เหลือ`, S5 computes the numbers first and that step must always succeed —
only the narration goes through AI. On a rate-limit hit, budget breach, or
`AI_ENABLED=false`, the bot replies with the plain deterministic Flex message in
the same reply. The number is never delayed or altered by AI.

---

## Tech stack

The stack is **locked** — see [AIDO.md §3](AIDO.md) before proposing a
substitution.

| Layer            | Technology                                                 | Cost                |
| ---------------- | ---------------------------------------------------------- | ------------------- |
| Frontend         | Next.js 14 (App Router) + TypeScript + Tailwind + Recharts | Free (Vercel Hobby) |
| Backend          | Next.js Route Handlers (monolith)                          | Free                |
| Database         | PostgreSQL 15+ (Supabase / Neon) + Prisma                  | Free tier           |
| Validation       | Zod                                                        | Free                |
| Bot              | LINE Messaging API SDK (Node)                              | Free (reply-first)  |
| Auth             | LINE Login v2.1 (OAuth 2.0 + OIDC)                         | Free                |
| Email ingest     | Cloudflare Email Routing → Worker                          | Free                |
| AI               | Provider-agnostic adapter (small/cheap model)              | ≤ 80 THB/mo         |
| Monte Carlo only | Python + FastAPI + NumPy                                   | Free                |
| Cron             | Vercel Cron / GitHub Actions                               | Free                |
| Monitoring       | Sentry                                                     | Free tier           |

TypeScript by default; Python is permitted **only** for S5 Level 3 Monte Carlo.

---

## Repository layout

```
/
├── AIDO.md            ← operating manual for AI agents
├── SPEC.md            ← source of truth
├── prisma/schema.prisma
├── src/
│   ├── app/           ← routes (parse → call module → format, nothing more)
│   ├── modules/       ← business logic, framework-agnostic
│   ├── lib/           ← db, money, datetime, errors
│   ├── components/
│   └── types/         ← Zod schemas, types via z.infer
└── tests/
    ├── fixtures/emails/   ← REDACTED only
    └── golden/
```

- Business logic lives in `src/modules/`; route handlers only parse input, call
  a module, and format output.
- Any file importing an AI provider must live under `src/modules/ai/`.
- Shared types live in `src/types/`, derived from Zod schemas where possible.

---

## Getting started

```bash
npm install
cp .env.example .env      # fill in the values
npx prisma migrate dev
npm run dev
```

Useful scripts:

```bash
npm run typecheck    # tsc --noEmit, strict
npm run lint         # ESLint, including the AI-free-zone import rules
npm run format       # Prettier
npm test             # Vitest
npm run test:cov     # Vitest with the 70% coverage gate
```

### Environment variables

Every variable is listed in `.env.example`, which **must** stay in sync with the
code and be committed. `.env` **must not** be.

---

## Contributing

Read **[AIDO.md](AIDO.md) completely before writing any code** — it has
authority over your default habits, whether you are a person or an AI agent.
[SPEC.md](SPEC.md) is the source of truth; when the two conflict, SPEC.md wins.

**Git** — `main` (protected) ← `dev` ← `feat/*`, `fix/*`. Conventional Commits.
One approval plus green CI to merge.

**Code** — TypeScript `strict: true`; ESLint + Prettier in CI; all money as
Prisma `Decimal`, never JavaScript `number` arithmetic.

**Testing** — unit tests are mandatory (≥ 70% coverage) for S4, S5, S9, S10,
and S11, and are written _before_ the implementation. Tests never call a real
AI provider — mock the adapter. Email fixtures are redacted, always.

Notable required tests: forecast determinism across 100 runs, money precision
across 10,000 sequential operations, a 30-email golden set where the regex tier
must reach ≥ 95% accuracy, a deliberately broken template that must fall
through to AI as a `pending` row, and an authorization test per endpoint.

Full checklist: [AIDO.md §10 Definition of Done](AIDO.md).

---

## Security

All 🔴 Critical requirements in [SPEC.md §8](SPEC.md) must be implemented and
reviewed before the project counts as successful. The ones that shape the
architecture most:

- Verify `X-Line-Signature` on every webhook; verify OAuth `state` and the
  `id_token` signature, `iss`, `aud`, `exp`, `nonce`.
- Never trust a client-supplied `userId`; row-level authorization on every
  query.
- Verify SPF/DKIM on inbound email.
- **PII redaction before every AI call** (account, card, phone, ID, full name).
- **Never send raw transaction history to AI** — aggregates only.
- Validate all AI output against a Zod schema before persistence.
- AI is opt-in per user and disableable at any time; the API key is server-side
  only.

Never commit secrets, real emails, or real financial data.

---

## Roadmap (10 weeks)

| Week | Goal                                                           |
| ---- | -------------------------------------------------------------- |
| 1    | Foundation — repo, CI, DB schema, LINE channels, OpenAPI draft |
| 2    | Auth — LINE Login end-to-end, webhook signature verification   |
| 3    | Transactions (web) — full CRUD, balance recomputes             |
| 4    | Transactions (chat) — `กาแฟ 80` reaches the dashboard          |
| 5    | Recurring + onboarding                                         |
| 6    | **Forecast v1** — EOM card and safe-to-spend in web and chat   |
| 7    | Dashboard + budgets — charts, search, export                   |
| 8    | **Email ingestion (regex tier)**                               |
| 9    | **Reconciliation + AI layer** — S11 guard, cache, T1, T2       |
| 10   | AI T3/T4, polish, internal testing                             |

Weeks 6, 8, and 9 must not be cut. If a week slips, cut P2 features first, then
P1. **S11 must not begin before Week 9** — the rule-based paths have to be
proven first, or AI becomes an expensive crutch masking weak fundamentals.

---

## Open decisions

These are unresolved and block the weeks noted. Do not resolve them in code.

| #   | Decision                                                                                                                                                                                                       | Blocks          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| D2  | Ratify S12 / AI task T5 into `SPEC.md`, or drop them from `AIDO.md` and defer to a later version. `SPEC.md` has no S12 section and no T5; `AIDO.md` requires both. No week in the roadmap is allocated to S12. | Week 9 planning |
| D5  | `SPEC.md` §S6 marks its DDL as reconstructed. `prisma/schema.prisma` was written from it and needs a table-by-table review by the S6 owner before the first migration is applied.                              | First migration |

Two related gaps fall out of D2: `ai_cache.task` is still documented as
`T1 \| T2 \| T3 \| T4`, and there is no environment variable for T5's rate limit
(`AIDO.md` specifies 30/user/day; `.env.example` carries only
`AI_RATE_LIMIT_PER_USER_DAY=20`).

---

## Team

| Member | Role           | Owns                                                 |
| ------ | -------------- | ---------------------------------------------------- |
| A      | Backend Lead   | S1 Gateway, S3.1 Auth, deployment, security review   |
| B      | Backend        | S3.2–3.4, S6 schema/migrations, S10 Reconciliation   |
| C      | Backend / Data | S4 Parser, S5 Forecast, S7 Scheduler, S11 AI Service |
| D      | Frontend Lead  | S2 architecture, dashboard, charts                   |
| E      | Frontend / UX  | Onboarding, forms, Flex design, QA, AI badges        |
| A + C  | Shared         | S8 Email Ingestion, S9 Bank Parser                   |

C owns the entire AI budget; no one else adds a provider call without C's
review.

---

## Non-goals

- ❌ Direct bank API / Open Banking integration
- ❌ Investment, stock, or crypto tracking
- ❌ Multi-currency (v1 is THB only)
- ❌ Commercial launch or monetization
- ❌ Native mobile apps
- ❌ AI-generated financial calculations, projections, or investment advice

---

## Documents

| File               | Purpose                                              |
| ------------------ | ---------------------------------------------------- |
| [SPEC.md](SPEC.md) | Source of truth — modules, schema, security, roadmap |
| [AIDO.md](AIDO.md) | Operating manual — rulebook, conventions, playbooks  |
