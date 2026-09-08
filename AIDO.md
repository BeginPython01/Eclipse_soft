# AIDO.md

**AI Agent Operating Manual for the Cashcast project.**

If you are an AI coding agent working in this repository, read this file completely before writing any code. This file has authority over your default behavior. When this file conflicts with your general habits, **this file wins**.

---

## 0. Quick Start for Agents

```
1. Read AIDO.md   (this file)      ← always
2. Read SPEC.md   (source of truth) ← always
3. Read the §5 Rulebook             ← non-negotiable constraints
4. Check §11 Task Playbooks         ← find your task type
5. Follow §12 Output Contract       ← how to report your work
```

If you only remember three things:

1. **Never let AI compute money.** Deterministic code owns every number that affects balance or forecast.
2. **Rules first, AI last, cache always.**
3. **When uncertain, stop and ask.** Do not guess at financial logic.

---

## 1. Project Context

| Field | Value |
|---|---|
| Name | Cashcast (working title) |
| Type | Experimental / educational, non-commercial |
| Team | 5 developers |
| Budget | ~100 THB/month; AI spend hard-capped at 80 THB |
| Timeline | 10 weeks |
| Spec version | 1.1 |

### What this product does

A personal finance app that answers exactly one question:

> **"Will my money last until the end of the year?"**

Users log expenses through LINE chat (`กาแฟ 80`) or via automatic K PLUS bank-email ingestion. A deterministic forecast engine projects the end-of-year balance, shortfall probability, and runway date.

### Architecture in one line

**Hybrid:** LINE Bot for fast capture and notifications + browser web app for dashboards and analysis, sharing one backend, one database, and one identity (`line_user_id`).

### Module map

| ID | Module | AI allowed? |
|---|---|---|
| S1 | LINE Gateway | ❌ |
| S2 | Web Frontend | ❌ |
| S3 | Core API | ❌ |
| S4 | Text Parser | ⚠️ L4 only |
| S5 | Forecast Engine | 🔴 NEVER |
| S6 | Database | ❌ |
| S7 | Scheduler | ❌ |
| S8 | Email Ingestion | ❌ |
| S9 | Bank Parser | ⚠️ R2 fallback only |
| S10 | Reconciliation | 🔴 NEVER |
| S11 | AI Service | ✅ (owns all AI) |

---

## 2. Source of Truth Hierarchy

When information conflicts, resolve in this order:

```
1. SPEC.md                    ← highest authority
2. AIDO.md (this file)        ← operating rules
3. Existing code in repo      ← follow established patterns
4. Your own judgment          ← lowest; ask instead
```

You must **never**:

- Contradict `SPEC.md` without explicitly flagging the conflict to a human
- Silently change a documented behavior
- Invent requirements not present in `SPEC.md`

If `SPEC.md` is ambiguous → **ask**. Do not resolve ambiguity in financial logic on your own.

---

## 3. Tech Stack (do not substitute)

| Layer | Technology | Locked? |
|---|---|---|
| Frontend | Next.js 14 App Router + TypeScript | 🔒 Yes |
| Styling | Tailwind CSS | 🔒 Yes |
| Charts | Recharts | 🔒 Yes |
| Backend | Next.js Route Handlers | 🔒 Yes |
| Database | PostgreSQL | 🔒 Yes |
| ORM | Prisma | 🔒 Yes |
| Validation | Zod | 🔒 Yes |
| Bot | LINE Messaging API SDK (Node) | 🔒 Yes |
| Auth | LINE Login v2.1 (OAuth 2.0 + OIDC) | 🔒 Yes |
| Email ingest | Cloudflare Email Routing → Worker | 🔒 Yes |
| Monitoring | Sentry | 🔒 Yes |
| Monte Carlo (only) | Python + NumPy | ⚠️ Restricted |

**Rules:**

- ❌ Do not introduce a new dependency without justification in your output report.
- ❌ Do not replace Prisma with raw SQL (except in explicitly documented performance-critical queries).
- ❌ Do not add Python anywhere except S5 Level 3 Monte Carlo.
- ❌ Do not add a state management library (Redux/Zustand/Jotai) — React Server Components plus URL state are sufficient.
- ❌ Do not add a UI component library beyond Tailwind without approval.

---

## 4. Repository Layout

```
/
├── AIDO.md                    ← you are here
├── SPEC.md                    ← source of truth
├── README.md
├── .env.example               ← MUST stay in sync with code
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── (marketing)/       ← landing
│   │   ├── (app)/             ← authenticated routes
│   │   │   ├── dashboard/
│   │   │   ├── transactions/
│   │   │   ├── recurring/
│   │   │   ├── budgets/
│   │   │   ├── pending/
│   │   │   ├── insights/
│   │   │   └── settings/
│   │   └── api/
│   │       ├── auth/
│   │       ├── transactions/
│   │       ├── recurring/
│   │       ├── forecast/
│   │       ├── line/webhook/
│   │       ├── email/ingest/
│   │       └── cron/
│   ├── modules/               ← business logic, framework-agnostic
│   │   ├── auth/              (S3.1)
│   │   ├── transaction/       (S3.2)
│   │   ├── budget/            (S3.3)
│   │   ├── user/              (S3.4)
│   │   ├── parser/            (S4)
│   │   ├── forecast/          (S5)  🔴 AI-free zone
│   │   ├── line/              (S1)
│   │   ├── email/             (S8)
│   │   ├── bank-parser/       (S9)
│   │   ├── reconcile/         (S10) 🔴 AI-free zone
│   │   └── ai/                (S11) ← ONLY place AI calls exist
│   ├── lib/
│   │   ├── db.ts
│   │   ├── money.ts           ← Decimal helpers
│   │   ├── datetime.ts        ← timezone helpers
│   │   └── errors.ts
│   ├── components/
│   └── types/
└── tests/
    ├── fixtures/
    │   └── emails/            ← REDACTED only
    └── golden/
```

**Placement rules:**

- Business logic goes in `src/modules/`, not in route handlers. Route handlers only parse input, call a module, and format output.
- Any file importing an AI provider must live under `src/modules/ai/`. This is enforced by lint rule and CI.
- Shared types go in `src/types/`, derived from Zod schemas wherever possible.

---

## 5. The Rulebook 🔴

These rules exist because this application handles people's money. Violating them causes **silent data corruption**, which is worse than a crash — a crash is visible; corrupted financial data is not.

### 5.1 Money Rules

| # | Rule |
|---|---|
| M1 | Never use `float`, `double`, `REAL`, or JS `number` for monetary arithmetic. Use `DECIMAL(12,2)` in Postgres and Prisma `Decimal` in code. |
| M2 | Amounts are always positive. Direction is expressed by `type` (income/expense) or `direction` (in/out) — never by sign. |
| M3 | Balance is always recomputed, never incrementally patched: `B = B_initial + Σ income − Σ expense` |
| M4 | All balance mutations run inside a database transaction. |
| M5 | Rows with `is_transfer = true` are excluded from spend statistics and forecasting. |
| M6 | Format for display as `฿12,400.00` with thousands separators. Never round in storage. |

### 5.2 AI Rules

| # | Rule |
|---|---|
| A1 | 🔴 AI must never compute a number that affects balance or forecast. It may extract a number literally present in text, and narrate numbers supplied to it. Nothing else. |
| A2 | 🔴 All AI output must pass Zod validation before persistence. Invalid output is discarded, never stored. |
| A3 | 🔴 AI-derived financial records are always `status = 'pending'` and require human confirmation, regardless of reported confidence. |
| A4 | 🔴 The system must fully function with `AI_ENABLED=false`. Every P0 feature works without AI. AI removal degrades convenience, never correctness. |
| A5 | 🔴 Never send raw transaction history to an AI provider. Aggregates only. |
| A6 | 🔴 Redact PII before every AI call: account numbers, card numbers, phone numbers, national IDs, full names. |
| A7 | 🔴 All AI calls go through `src/modules/ai/`. No module may call a provider directly. |
| A8 | 🟠 Cache-first: every AI task checks `ai_cache` before any provider call. |
| A9 | 🟠 AI-generated UI content carries a visible ✨ AI badge plus the disclaimer "ข้อมูลเชิงวิเคราะห์ ไม่ใช่คำแนะนำทางการเงิน". |
| A10 | 🟠 AI is opt-in per user via `users.ai_enabled`. |

### 5.3 Security Rules

| # | Rule |
|---|---|
| S1 | 🔴 Verify `X-Line-Signature` (HMAC-SHA256) on every LINE webhook → 401 on mismatch. |
| S2 | 🔴 Verify OAuth `state` parameter on every auth callback → 403 on mismatch. |
| S3 | 🔴 Verify `id_token`: signature, `iss`, `aud`, `exp`, `nonce`. |
| S4 | 🔴 Never trust a client-supplied `userId`. Identity comes from the server-side session only. |
| S5 | 🔴 Every database query must be scoped: `WHERE user_id = session.userId`. No exceptions. |
| S6 | 🔴 Verify SPF/DKIM on every inbound email before processing. |
| S7 | 🔴 Session tokens in `httpOnly` + `secure` + `sameSite=Lax` cookies. Never localStorage. |
| S8 | 🔴 API keys and secrets are server-side only. Never exposed to the client bundle. |
| S9 | 🟠 Redact PII in logs and Sentry. |
| S10 | 🟠 `ingest_token` must be ≥ 32 cryptographically random bytes, never derived from `user_id`. |

### 5.4 Data Rules

| # | Rule |
|---|---|
| D1 | Use `TIMESTAMPTZ`, never naive timestamps. |
| D2 | Respect each user's timezone (default `Asia/Bangkok`) — never assume server UTC for user-facing scheduling. |
| D3 | Soft-delete transactions (`deleted_at`), hard-delete only on account deletion. |
| D4 | Always persist `raw_email` before parsing, enabling re-parse after template changes. |
| D5 | Never commit unredacted real bank emails, account numbers, or real amounts. |
| D6 | Every row with `parsed_by = 'ai'` or `extracted_by = 'ai'` must store a confidence value. |

---

## 6. AI-Free Zones 🔴

The following modules must contain **zero** AI calls. If a task asks you to add AI here, refuse and explain why.

| Module | Why it must stay deterministic |
|---|---|
| S5 Forecast Engine | Non-deterministic output destroys trust. The same inputs must always yield identical results. A user seeing ฿12,400 today and ฿12,800 tomorrow with unchanged data will abandon the app permanently. |
| S10 Reconciliation | A false merge silently destroys financial data with no error trace. Matching must be exact and auditable. |
| Balance calculation | Arithmetic correctness is absolute. |
| Duplicate detection | Requires exact matching within a defined window. |
| Internal transfer detection | Deterministic pattern; rule-based is both cheaper and more accurate. |
| Recurring-pattern detection | `GROUP BY` plus interval analysis outperforms AI here at zero cost. |
| Anomaly detection | Z-score / IQR is explainable and free. |

---

## 7. Where AI Is Allowed

Only four tasks, all inside `src/modules/ai/`:

| Task | Caller | Purpose | Priority |
|---|---|---|---|
| T1 `parseTransactionText` | S4 (L4 fallback) | Complex free-form Thai text | P1 |
| T2 `normalizeMerchant` | S9 | Cryptic POS codes → readable names | P1 (highest ROI) |
| T3 `extractFromEmail` | S9 (R2 fallback) | Email extraction when regex fails | P2 |
| T4 `generateInsight` | S3 / S7 | Narrate pre-computed figures in Thai | P2 |

Every task must pass through the **Guard Layer**, in this order:

```
1. ai_enabled check   → else deterministic fallback
2. Cache lookup       → return on hit (no provider call)
3. Rate limit         → 20/user/day (T1, T4); 50/day system-wide (T3)
4. Budget breaker     → disable on AI_MONTHLY_BUDGET_THB breach
5. PII redaction      → mandatory
6. Provider call      → 8s timeout, max 1 retry
7. Zod validation     → discard on failure
8. Sanity checks      → range and plausibility
9. Log to ai_usage_log → always, including cache hits
```

**Sanity checks for extracted values:**

- `0 < amount ≤ 10,000,000`
- `occurred_at` within ±7 days of `received_at`
- `direction ∈ {'in', 'out'}`

Any failure → discard, mark failed, route to manual review.

---

## 8. Coding Conventions

### TypeScript

Standards:

- `strict: true` — no `any`, no non-null assertions without justification
- Named exports; default exports only for Next.js pages and layouts
- Zod schema first, then `z.infer` for the type — never define both by hand
- Errors: throw typed errors from `src/lib/errors.ts`, never bare strings
- Async: `async/await` only, no raw `.then()` chains

### Naming

| Kind | Convention | Example |
|---|---|---|
| Files | kebab-case | `bank-parser.ts` |
| Components | PascalCase | `ForecastCard.tsx` |
| Functions | camelCase, verb-first | `computeForecast()` |
| Constants | SCREAMING_SNAKE | `AI_MONTHLY_BUDGET_THB` |
| DB tables | snake_case, plural | `bank_transactions` |
| Zod schemas | PascalCase + `Schema` | `TransactionSchema` |

### Comments

Explain **why**, not **what**. Every non-obvious financial rule gets a comment referencing the spec section:

```typescript
// SPEC §5 M5: transfers excluded from spend stats to prevent
// double-counting when a user moves money between own accounts
```

---

## 9. Testing Requirements

Mandatory unit test coverage (**≥ 70%**): S4 Parser, S5 Forecast, S9 Bank Parser, S10 Reconciliation, S11 AI Service.

| Rule | Detail |
|---|---|
| T1 | Never call a real AI provider in tests. Mock the adapter. |
| T2 | Parser tests use redacted fixtures in `tests/fixtures/emails/`. |
| T3 | Golden-set test: 30 redacted K PLUS emails; regex tier must reach ≥ 95% extraction accuracy. |
| T4 | Broken-template test: corrupt a fixture; assert R2 (AI) is invoked and produces a pending row. |
| T5 | Forecast determinism test: identical inputs must produce byte-identical output across 100 runs. |
| T6 | Money precision test: verify no rounding drift across 10,000 sequential operations. |
| T7 | Authorization test: every endpoint must reject access to another user's data. |

Write the test **before** the implementation for S4, S5, S9, S10, and S11.

---

## 10. Definition of Done

A task is complete only when all of the following hold:

- [ ] Code compiles with `strict: true`, zero TypeScript errors
- [ ] ESLint and Prettier pass
- [ ] Unit tests written and passing (for the five mandatory modules)
- [ ] No rule from §5 is violated
- [ ] All queries scoped by `user_id`
- [ ] All money handled as `Decimal`
- [ ] `.env.example` updated if new environment variables were added
- [ ] `SPEC.md` updated if behavior changed
- [ ] No secrets, real emails, or real financial data committed
- [ ] Conventional Commit message written
- [ ] Output report produced per §12

---

## 11. Task Playbooks

### 11.1 Adding an API endpoint

```
1. Define Zod schema for request and response in src/types/
2. Implement business logic in src/modules/{module}/
3. Create route handler in src/app/api/ — parse, call module, format
4. Enforce: session check → user_id scoping → Zod validation
5. Write tests including an authorization-bypass test
6. Update OpenAPI spec
```

Route handler template:

```typescript
// src/app/api/transactions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/modules/auth/session';
import { createTransaction } from '@/modules/transaction/create';
import { CreateTransactionSchema } from '@/types/transaction';
import { AppError } from '@/lib/errors';

export async function POST(req: NextRequest) {
  // SPEC §5 S4: identity comes from the server-side session only
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const parsed = CreateTransactionSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    // SPEC §5 S5: every query scoped by user_id
    const result = await createTransaction(session.userId, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    throw e; // unexpected → Sentry
  }
}
```

### 11.2 Adding a bank parser

```
1. Implement the BankParser interface in src/modules/bank-parser/parsers/
2. Add ≥ 10 redacted fixtures to tests/fixtures/emails/{bankCode}/
3. Write tests FIRST, then the parser
4. Register in the parser registry keyed by bankCode
5. Version the parser; store parser_version on every row
6. Verify R2 (AI) fallback triggers correctly on malformed input
```

Never hardcode a bank template inline — extract patterns into `parser_rules` so they can change without a deploy.

### 11.3 Touching the Forecast Engine

> ⚠️ **HIGHEST-RISK AREA — proceed carefully**

```
1. Read SPEC.md §S5 completely
2. Confirm the change preserves determinism
3. Use median, not mean, for daily spend (large one-off purchases skew mean)
4. Count REMAINING occurrences of recurring rules, not naive monthly multiples
5. Exclude is_transfer rows
6. Bump method_version on any formula change
7. Run the determinism test (T5)
8. Never introduce AI here
```

### 11.4 Adding an AI task

```
1. Confirm it is NOT in the AI-Free Zones (§6)
2. Confirm rules cannot solve it — if GROUP BY works, use GROUP BY
3. Implement in src/modules/ai/tasks/
4. Define a Zod output schema BEFORE writing the prompt
5. Route through the full Guard Layer (§7)
6. Implement a deterministic fallback for provider failure
7. Add cache key derivation with normalized input
8. Log to ai_usage_log
9. Mock the provider in tests
```

**Prompt requirements:**

- Explicitly instruct: *"Extract only. Do not infer, estimate, or calculate any value not literally present. Return null for absent fields."*
- Enforce JSON-only output
- Keep prompts short — tokens cost money on a 100 THB budget

### 11.5 Modifying the database schema

```
1. Update prisma/schema.prisma
2. Generate a migration — never edit the database directly
3. Verify money columns are DECIMAL(12,2)
4. Verify timestamps are TIMESTAMPTZ
5. Add indexes for any new query pattern
6. Update SPEC.md §S6
7. Confirm the migration is reversible
```

---

## 12. Output Contract

After completing a task, report in this format:

```markdown
## Summary
<one paragraph: what was done and why>

## Files Changed
- `path/to/file.ts` — <what changed>

## Rules Applied
- SPEC §5 M1: money handled as Decimal
- SPEC §5 S5: all queries scoped by user_id

## Tests
- <test name> — <what it proves> — pass/fail
- Coverage: <n>%

## Dependencies Added
- none  (or: <name> — <justification>)

## Assumptions
- <non-financial assumptions only>

## Open Questions
- <anything requiring human confirmation, especially financial logic>

## Commit Message
feat(module): <conventional commit message>
```

If you made an assumption about **financial logic**, it goes under **Open Questions**, not Assumptions. Financial logic requires human confirmation.

---

## 13. When to Stop and Ask 🛑

Stop immediately and ask a human when:

| Situation | Why |
|---|---|
| A task requires AI in an AI-Free Zone | Violates a core architectural guarantee |
| A change alters how balance is computed | Data-integrity risk |
| Forecast formula semantics are unclear | Silent inaccuracy is worse than an error |
| A security rule appears to block a requirement | Never work around security — escalate |
| You want to add a dependency not in §3 | Stack is locked |
| You want to store money as a non-Decimal type | Absolute prohibition |
| Real user data would be committed | Privacy violation |
| The spec contradicts itself | Requires human arbitration |
| A task would exceed the AI budget | Cost control |

**Never do these silently:**

- Change a database column type
- Modify authentication or session logic
- Alter reconciliation matching thresholds
- Disable a validation check to make a test pass
- Commit anything to `main`

---

## 14. Common Mistakes to Avoid

| ❌ Mistake | ✅ Correct approach |
|---|---|
| `amount: number` in a Prisma model | `amount: Decimal` |
| `balance += amount` | Recompute from all transactions |
| Storing a negative amount for expenses | Positive amount + `type: 'expense'` |
| `WHERE id = ?` without `user_id` | Always scope by `user_id` |
| Calling an AI provider from a route handler | Route through `src/modules/ai/` |
| Auto-confirming an AI-extracted transaction | Always `pending` |
| Sending full transaction history to AI | Aggregates only |
| Using `new Date()` for user-facing schedules | Use the user's timezone |
| Trusting `req.body.userId` | Use `session.userId` |
| Regex-parsing inline in a bank parser | Extract to `parser_rules` |
| Mean for daily spend | Median |
| Committing a real bank email | Redact first |
| Adding Zustand "for convenience" | Server Components + URL state |
| `catch (e) { }` | Typed error, logged to Sentry |

---

## 15. Glossary

| Term | Meaning |
|---|---|
| EOY | End of Year — Dec 31 of the current year |
| Runway date | Projected date on which balance reaches zero |
| Recurring rule | A repeating income/expense definition used for forecasting |
| Materialize | Converting a recurring rule into an actual transaction on its due date |
| Reconciliation | Matching bank-sourced records against user-entered records |
| Guard Layer | Pre-flight checks (cache, rate limit, budget, redaction) before any AI call |
| Circuit breaker | Automatic AI shutdown on budget cap breach |
| R1 / R2 | Bank parser tiers — R1 regex (primary), R2 AI (fallback) |
| L1–L4 | Text parser layers — L1 regex, L2 dictionary, L3 learned, L4 AI |
| Cache-first | Mandatory `ai_cache` lookup preceding every provider call |
| AI-Free Zone | A module where AI calls are architecturally forbidden |

---

## 16. Philosophy

> **Rules first, AI last, cache always.**

This system handles money. Users trust it to tell them whether they can afford rent in December. That trust is built on **predictability**, not cleverness.

Every design decision follows from one question:

> *"If this component fails or behaves unexpectedly, does the user lose money, lose trust, or lose data — silently?"*

If yes, it must be deterministic, tested, and auditable.

AI belongs at the edges — absorbing messy human input and cryptic merchant codes — never at the core. If the AI provider disappeared tomorrow, this application must still work. That is the design target, and Success Criterion #7 in `SPEC.md` exists to prove it.

---

*Document version: 1.0 — 2026-09-08*
*Companion to: `SPEC.md` v1.1*
*If `SPEC.md` is updated, update this file's rule references accordingly.*
