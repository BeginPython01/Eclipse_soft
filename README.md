# Cashcast

> **"Will my money last until the end of the year?"**

A personal finance app that answers exactly one question. Log expenses in three
seconds through LINE chat (`กาแฟ 80`) or let K PLUS bank emails flow in
automatically, and a deterministic forecast engine projects your end-of-year
balance, shortfall probability, and runway date.

**Status:** Specification phase — no application code yet. This repository
currently holds the design documents the implementation will be built from.

> ⚠️ Experimental / educational project. Non-commercial, THB only, not
> financial advice.

---

## Why

Most personal finance apps fail for two reasons:

1. **Manual entry fatigue** — users abandon logging within 2–3 weeks.
2. **Backward-looking only** — they show where money *went*, not whether money
   *will last*.

Cashcast attacks both: near-zero input friction, and a forward-looking forecast
as the primary screen.

## Three pillars

| Pillar | What it means |
|---|---|
| **A — Near-zero input friction** | Type `กาแฟ 80` in LINE, or forward K PLUS emails and never type at all |
| **B — Actionable forecasting** | "Projected balance on Dec 31: ฿12,400. 23% chance of shortfall in November." |
| **C — AI as a safety net** | AI absorbs messy edges (free-form Thai, cryptic merchant codes, changed email templates) — **without ever touching the numbers** |

---

## Architecture

Hybrid: a LINE Bot for capture and notifications, plus a browser app for
dashboards and analysis. Both share **one backend, one database, one identity**
(`line_user_id`).

| Surface | Responsibility |
|---|---|
| LINE Bot | Fast capture, quick summary, push notifications |
| Web app | Dashboard, charts, simulation, settings |

### Modules

| ID | Module | AI allowed? |
|---|---|---|
| S1 | LINE Gateway — webhook verification, event routing | ❌ |
| S2 | Web Frontend — Next.js App Router surfaces | ❌ |
| S3 | Core API — auth, transactions, budgets, users | ❌ |
| S4 | Text Parser — four-layer Thai text cascade | ⚠️ L4 only |
| S5 | Forecast Engine — EOY projection | 🔴 never |
| S6 | Database — PostgreSQL schema | ❌ |
| S7 | Scheduler — cron jobs, recurring materialization | ❌ |
| S8 | Email Ingestion — Cloudflare Email Worker | ❌ |
| S9 | Bank Parser — K PLUS extraction (R1 regex / R2 AI) | ⚠️ R2 fallback |
| S10 | Reconciliation — dedup, transfer detection | 🔴 never |
| S11 | AI Service — the only place model calls exist | ✅ |

---

## Two design decisions worth knowing up front

### 1. AI never computes money

The forecast engine and reconciliation are strict **AI-free zones**. Every
number that affects a balance or a projection comes from deterministic code
with reproducible output — identical inputs must always yield identical
results. AI may *narrate* a forecast; it may never compute, adjust, or override
a value.

The definitive test: **with `AI_ENABLED=false`, every P0 feature still works.**

### 2. Rules first, AI last, cache always

Both parsers escalate through cheap deterministic tiers before spending a
single satang on a model call.

**Text parsing (S4)** — AI handles roughly the last 5%:

| Layer | Method | Coverage | Cost |
|---|---|---|---|
| L1 | Regex (amount + sign) | ~60% | Free |
| L2 | Thai keyword dictionary | +25% | Free |
| L3 | Per-user learned dictionary | +10% | Free |
| L4 | AI fallback (S11 T1) | ~5% | Paid |

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
                T4 generateInsight       (← S3/S7)
③ PROVIDER ADAPTER   swappable, env-driven — no SDK lock-in
④ VALIDATOR + FALLBACK   Zod schema → sanity ranges
                → deterministic fallback on failure → always log usage
```

**T2 is the highest-ROI task.** `"POS 7-11 SUKHUMV 42"` → `7-Eleven / ของใช้`,
written to a *global* merchant dictionary: one call benefits every user
forever, with an expected cache hit rate above 90% after the first month.

AI output is always validated against a Zod schema, always range-checked, and
AI-extracted transactions always land as `pending` for human confirmation.
Anything AI-produced in the UI carries a visible ✨ badge and the disclaimer
*"ข้อมูลเชิงวิเคราะห์ ไม่ใช่คำแนะนำทางการเงิน"*.

Total AI spend is hard-capped at **80 THB/month**, in code *and* in the
provider dashboard.

---

## Forecast engine (S5)

**Level 1 — deterministic (required)**

```
B_EOY = B_now + Σ R_in − Σ R_out − (d̃ × D)
```

`d̃` is the **median** daily non-recurring spend (not the mean); `D` is days
remaining until Dec 31; recurring sums count remaining *occurrences*, not naive
monthly multiples.

**Level 2 — seasonality (required)** applies per-month factors (Thailand
defaults: Apr 1.15, Nov 1.10, Dec 1.25), replaced by learned factors after 12
months of history.

**Level 3 — Monte Carlo (P2)** runs 5,000 iterations from a log-normal fit to
produce P10/P50/P90 and a fan chart.

Confidence is always visible, and honest about cold start:

| Data age | Method | Confidence |
|---|---|---|
| 0–6 days | Recurring only | 🔴 Preliminary |
| 7–29 days | Recurring + partial average | 🟡 Medium |
| 30+ days | Full formula + seasonality | 🟢 High |

---

## Chat commands

| Input | Action |
|---|---|
| `กาแฟ 80` | Log an expense |
| `+เงินเดือน 35000` | Log income |
| `สรุป` | Monthly summary (Flex) |
| `เหลือ` | Balance + EOY forecast |
| `วิเคราะห์` | AI insight (rate-limited) |
| `ช่วยเหลือ` | Usage guide |

Every parse replies with ✅ ถูกต้อง / ✏️ แก้หมวด buttons. Corrections are the
training signal for the learned dictionary.

---

## Tech stack

The stack is **locked** — see [AIDO.md §3](AIDO.md) before proposing a
substitution.

| Layer | Technology | Cost |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind + Recharts | Free (Vercel Hobby) |
| Backend | Next.js Route Handlers (monolith) | Free |
| Database | PostgreSQL 15+ (Supabase / Neon) + Prisma | Free tier |
| Validation | Zod | Free |
| Bot | LINE Messaging API SDK (Node) | Free (reply-first) |
| Auth | LINE Login v2.1 (OAuth 2.0 + OIDC) | Free |
| Email ingest | Cloudflare Email Routing → Worker | Free |
| AI | Provider-agnostic adapter (small/cheap model) | ≤ 80 THB/mo |
| Monte Carlo only | Python + FastAPI + NumPy | Free |
| Cron | Vercel Cron / GitHub Actions | Free |
| Monitoring | Sentry | Free tier |

TypeScript by default; Python is permitted **only** for S5 Level 3 Monte Carlo.

---

## Repository layout

```
/
├── AIDO.md      ← operating manual for AI agents
├── SPEC.md      ← source of truth
└── README.md    ← this file
```

The implementation will follow the tree documented in
[AIDO.md §4](AIDO.md), the essentials of which are:

- Business logic lives in `src/modules/`; route handlers only parse input, call
  a module, and format output.
- Any file importing an AI provider must live under `src/modules/ai/`.
- Shared types live in `src/types/`, derived from Zod schemas where possible.

---

## Getting started

Nothing to run yet. When the scaffold lands, the shape will be:

```bash
npm install
cp .env.example .env      # fill in the values below
npx prisma migrate dev
npm run dev
```

### Environment variables

```bash
DATABASE_URL
LINE_CHANNEL_ID
LINE_CHANNEL_SECRET
LINE_CHANNEL_ACCESS_TOKEN
LINE_LOGIN_CHANNEL_ID
LINE_LOGIN_CHANNEL_SECRET
NEXTAUTH_URL
SESSION_SECRET
EMAIL_INGEST_DOMAIN
EMAIL_WORKER_SECRET
SENTRY_DSN

# AI
AI_ENABLED=true
AI_PROVIDER=
AI_API_KEY=
AI_MODEL=
AI_MONTHLY_BUDGET_THB=80
AI_RATE_LIMIT_PER_USER_DAY=20
AI_EMAIL_DAILY_LIMIT=50
AI_TIMEOUT_MS=8000
AI_CACHE_TTL_DAYS=90
```

`.env.example` **must** stay in sync with the code and be committed. `.env`
**must not** be.

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
and S11, and are written *before* the implementation. Tests never call a real
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

| Week | Goal |
|---|---|
| 1 | Foundation — repo, CI, DB schema, LINE channels, OpenAPI draft |
| 2 | Auth — LINE Login end-to-end, webhook signature verification |
| 3 | Transactions (web) — full CRUD, balance recomputes |
| 4 | Transactions (chat) — `กาแฟ 80` reaches the dashboard |
| 5 | Recurring + onboarding |
| 6 | **Forecast v1** — EOY card in web and chat |
| 7 | Dashboard + budgets — charts, search, export |
| 8 | **Email ingestion (regex tier)** |
| 9 | **Reconciliation + AI layer** — S11 guard, cache, T1, T2 |
| 10 | AI T3/T4, polish, internal testing |

Weeks 6, 8, and 9 must not be cut. If a week slips, cut P2 features first, then
P1. **S11 must not begin before Week 9** — the rule-based paths have to be
proven first, or AI becomes an expensive crutch masking weak fundamentals.

---

## Team

| Member | Role | Owns |
|---|---|---|
| A | Backend Lead | S1 Gateway, S3.1 Auth, deployment, security review |
| B | Backend | S3.2–3.4, S6 schema/migrations, S10 Reconciliation |
| C | Backend / Data | S4 Parser, S5 Forecast, S7 Scheduler, S11 AI Service |
| D | Frontend Lead | S2 architecture, dashboard, charts |
| E | Frontend / UX | Onboarding, forms, Flex design, QA, AI badges |
| A + C | Shared | S8 Email Ingestion, S9 Bank Parser |

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

| File | Purpose |
|---|---|
| [SPEC.md](SPEC.md) | Source of truth — modules, schema, security, roadmap |
| [AIDO.md](AIDO.md) | Operating manual — rulebook, conventions, playbooks |
