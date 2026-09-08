# SPEC.md

## 1. Project Overview

**Project Name:** (TBD — working title: "Cashcast")
**Type:** Experimental / educational project (non-commercial)
**Team Size:** 5 developers
**Budget:** ~100 THB/month (free-tier first; AI spend hard-capped)
**Timeline:** 10 weeks
**Version:** 1.1 — adds S11 AI Service

---

### 1.1 Problem Statement

Most personal finance apps fail for two reasons:

1. **Manual entry fatigue** — users abandon logging within 2–3 weeks.
2. **Backward-looking only** — they show where money *went*, not whether money *will last*.

### 1.2 Product Thesis

This app answers exactly one question:

> **"Will my money last until the end of the year?"**

Three pillars support it:

- **Pillar A — Near-zero input friction:** Type `กาแฟ 80` in LINE, or let K PLUS emails flow in automatically.
- **Pillar B — Actionable forecasting:** "Projected balance on Dec 31: ฿12,400. 23% chance of shortfall in November."
- 🆕 **Pillar C — AI as a safety net:** AI absorbs the messy edges (free-form Thai text, cryptic merchant codes, changed email templates) that deterministic rules cannot cover — **without ever touching the numbers**.

### 1.3 Non-Goals

- ❌ Direct bank API / Open Banking integration
- ❌ Investment, stock, or crypto tracking
- ❌ Multi-currency (v1 is THB only)
- ❌ Commercial launch / monetization
- ❌ Native mobile apps
- 🆕 ❌ AI-generated financial calculations, projections, or investment advice

---

## 2. Architecture

### 2.1 Hybrid Model

| Surface | Responsibility | Rationale |
|---|---|---|
| LINE Bot | Fast capture, quick summary, notifications | User already lives in LINE; 3-second logging |
| Web App (browser) | Dashboard, charts, simulation, settings | Full screen, real DevTools, complex UI |

Both surfaces share **one backend, one database, one identity** (`line_user_id`).

### 2.2 System Diagram 🆕

```
┌───────────────┐         ┌────────────────────┐
│   LINE App    │         │  Browser (any)     │
└───────┬───────┘         └─────────┬──────────┘
        ▼                           ▼
┌──────────────────┐      ┌──────────────────────┐
│ S1 LINE Gateway  │      │ S2 Web Frontend      │
└────────┬─────────┘      └──────────┬───────────┘
         └────────────┬──────────────┘
                      ▼
         ┌────────────────────────────┐
         │   S3 Core API              │
         └──┬──────┬──────┬────────┬──┘
            ▼      ▼      ▼        ▼
      ┌────────┐ ┌──────────┐ ┌─────────┐
      │S4 Text │ │S5        │ │S6       │
      │Parser  │ │Forecast  │ │Postgres │
      │ L1-L3  │ │(NO AI)   │ │         │
      └───┬────┘ └──────────┘ └─────────┘
          │ L4 fallback            ▲
          ▼                        │
   ┌─────────────────┐      ┌──────┴───────────┐
   │ S11 AI Service  │      │S7 Scheduler      │
   │ ┌─────────────┐ │      └──────────────────┘
   │ │Guard Layer  │ │
   │ │cache│limit  │ │      ┌──────────────────┐
   │ │budget│redact│ │◄─────┤S8 Email Ingestion│
   │ └─────────────┘ │      │  ← K PLUS emails │
   │ ┌─────────────┐ │      └────────┬─────────┘
   │ │Task Router  │ │               ▼
   │ │ parse       │ │      ┌──────────────────┐
   │ │ merchant    │ │◄─────┤S9 Bank Parser    │
   │ │ email-fb 🆕 │ │      │ R1 Regex (primary)│
   │ │ insight     │ │      │ R2 AI  (fallback) │
   │ └─────────────┘ │      └────────┬─────────┘
   │ ┌─────────────┐ │               ▼
   │ │Validator +  │ │      ┌──────────────────┐
   │ │Fallback     │ │      │S10 Reconciliation│
   │ └─────────────┘ │      │    (NO AI)       │
   └─────────────────┘      └──────────────────┘
```

### 2.3 Technology Stack

| Layer | Technology | Cost |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind + Recharts | Free (Vercel Hobby) |
| Backend | Next.js Route Handlers (monolith) | Free |
| Database | PostgreSQL (Supabase / Neon) | Free tier |
| ORM | Prisma | Free |
| Bot | LINE Messaging API SDK (Node) | Free (reply-only) |
| Auth | LINE Login v2.1 (OAuth 2.0 + OIDC) | Free |
| Email Ingest | Cloudflare Email Routing → Worker | Free |
| 🆕 AI | Provider-agnostic adapter (small/cheap model) | Hard-capped ≤ 80 THB/mo |
| 🆕 Schema validation | Zod | Free |
| Forecast (heavy) | Python + FastAPI + NumPy (Monte Carlo only) | Free |
| Cron | Vercel Cron / GitHub Actions | Free |
| Monitoring | Sentry (free tier) | Free |

**Language policy:** TypeScript by default. Python only for Monte Carlo (S5-L3).
🆕 **AI policy:** No SDK lock-in. All model calls go through a single provider adapter so the model can be swapped — or disabled entirely — via environment variables.

---

## 3. Modules

### S1 — LINE Gateway

**Responsibility:** Receive and validate LINE webhooks, route events.

**Requirements:**

- MUST verify `X-Line-Signature` (HMAC-SHA256) on every request → 401 on mismatch.
- MUST respond `200 OK` within 1 second.
- MUST be idempotent — persist `webhookEventId`, ignore duplicates.
- MUST prefer Reply API over Push (Reply is free).

| Event | Behavior |
|---|---|
| `follow` | Create user, send onboarding + web link |
| `message.text` | Route to S4 → persist → reply Flex confirmation |
| `postback` | Category correction, confirm, delete |
| `unfollow` | `is_active = false` (never delete data) |

🆕 **AI latency handling:** If S4 escalates to S11 (L4), the gateway MUST send an immediate optimistic reply (`⏳ กำลังบันทึก...`) using the reply token, then Push the final result. Reply tokens expire in ~1 minute and cannot wait on AI latency.

**Chat commands:**

| Input | Action |
|---|---|
| `กาแฟ 80` | Log expense |
| `+เงินเดือน 35000` | Log income |
| `สรุป` | Monthly summary Flex |
| `เหลือ` | Balance + EOY forecast |
| 🆕 `วิเคราะห์` | AI-generated insight (rate-limited) |
| `ช่วยเหลือ` | Usage guide |

---

### S2 — Web Frontend

| Route | Purpose | Priority |
|---|---|---|
| `/` | Landing + "Login with LINE" | P0 |
| `/onboarding` | Initial balance, recurring setup | P0 |
| `/dashboard` | Balance card, forecast card, charts | P0 |
| `/transactions` | List, filter, search, edit, delete | P0 |
| `/transactions/new` | Detailed entry form | P0 |
| `/recurring` | Manage recurring rules | P0 |
| `/budgets` | Category budgets + progress | P1 |
| `/pending` | Review unconfirmed bank transactions | P1 |
| 🆕 `/insights` | AI insight cards + history | P2 |
| `/simulate` | What-if slider simulator | P2 |
| `/settings` | Timezone, notifications, email source, AI toggle 🆕, export, delete | P1 |

**Constraints:**

- Skeleton loaders on all data views.
- Currency as `฿12,400.00`.
- Charts degrade gracefully when data < 7 days.
- 🆕 Any AI-produced content MUST carry a visible ✨ AI badge and the disclaimer "ข้อมูลเชิงวิเคราะห์ ไม่ใช่คำแนะนำทางการเงิน".

---

### S3 — Core API

#### S3.1 Auth Module

LINE Login OAuth 2.0 flow:

```
1. User clicks "Login with LINE"
2. Server generates `state` + `nonce` → httpOnly cookie
3. Redirect → https://access.line.me/oauth2/v2.1/authorize
     ?response_type=code&client_id={CHANNEL_ID}
     &redirect_uri={CALLBACK_URL}&state={state}
     &scope=profile%20openid&nonce={nonce}
4. Callback → /api/auth/callback?code=...&state=...
5. MUST verify `state` matches cookie → else 403
6. Exchange code → POST https://api.line.me/oauth2/v2.1/token
7. Verify `id_token`: signature, iss, aud, exp, nonce
8. Extract `sub` → upsert user → issue session
```

**Session:** `httpOnly` + `secure` + `sameSite=Lax`, 7-day sliding expiry.
MUST NOT store tokens in localStorage. MUST NOT trust client-supplied `userId`.

#### S3.2 Transaction Module

| Method | Path | Description |
|---|---|---|
| GET | `/api/transactions` | List (pagination, `from`, `to`, `categoryId`, `q`) |
| POST | `/api/transactions` | Create |
| PATCH | `/api/transactions/:id` | Update |
| DELETE | `/api/transactions/:id` | Soft delete |
| GET | `/api/transactions/export` | CSV / JSON |

**Validation:** `amount > 0`; `occurred_at ≤ now + 1 day`; `note ≤ 500` chars; all balance mutations inside a DB transaction.

```
B_current = B_initial + Σ income − Σ expense
```

Recomputed on every mutation — **never incrementally patched**.

#### S3.3 Budget & Recurring Module

- CRUD for `recurring_rules` (weekly / monthly / yearly).
- Materialization by S7 with `is_auto = true`.
- Budget alerts at 80% and 100%.
- 🆕 Auto-detection of recurring patterns is **statistical, not AI** (see §3.11.5).

#### S3.4 User Module

- Profile, timezone (default `Asia/Bangkok`), notification preferences.
- 🆕 `ai_enabled` per-user opt-in flag.
- `GET /api/me/export` — full data export.
- `DELETE /api/me` — hard delete all data.

---

### S4 — Text Parser

Four-layer cascade, ordered by cost:

| Layer | Method | Coverage | Cost | Owner |
|---|---|---|---|---|
| L1 | Regex (amount + sign) | ~60% | Free | S4 |
| L2 | Thai keyword dictionary | +25% | Free | S4 |
| L3 | Per-user learned dictionary | +10% | Free | S4 |
| 🆕 L4 | AI fallback | ~5% | Paid | S11 |

🆕 **Escalation rule:** L4 is invoked only when L1–L3 produce confidence < 0.6 or fail to extract an amount. L4 must never run when earlier layers succeed.

**Must-support inputs:**

```
กาแฟ 80              → expense 80, beverage
ข้าว60               → expense 60  (no space)
+เงินเดือน 35000      → income 35000
1,250 ซื้อของ         → expense 1250 (comma)
🆕 จ่ายค่าไฟ 890 ค่าน้ำ 210   → 2 transactions (L4)
🆕 หารค่าข้าว 4 คน จ่าย 320   → expense 80    (L4)
🆕 เมื่อวานซื้อกาแฟกับขนม 145 → expense 145, yesterday (L4)
```

**Self-learning loop (critical):** Every parse replies with Flex buttons ✅ ถูกต้อง / ✏️ แก้หมวด. Corrections write to `user_keyword_map` and take precedence thereafter.

🆕 **AI → dictionary promotion:** When an L4 result is confirmed by the user, its keyword→category mapping is written to `user_keyword_map`. The same phrase must never reach L4 twice. The system therefore becomes progressively cheaper and faster with use.

---

### S5 — Forecast Engine

> 🔴 🆕 **This module is strictly AI-free.** Every number is produced by deterministic code. AI may *narrate* forecast output (S11 Task 4) but MUST NOT compute, adjust, or override any value. Reproducibility is a hard requirement — identical inputs must always yield identical outputs.

#### Level 1 — Deterministic (required)

```
B_EOY = B_now + Σ R_in − Σ R_out − (d̃ × D)
```

- `d̃` = median daily non-recurring spend (**median**, not mean)
- `D` = days remaining until Dec 31
- `Σ R` = sum over **remaining occurrences**, not naive monthly multiples

#### Level 2 — Seasonality (required)

```
B_EOY = B_now + Σ R − Σ_m ( d̃ × d_m × s_m )
```

Default `s_m` (Thailand): Apr = 1.15, Nov = 1.10, Dec = 1.25, else 1.00.
Replaced by learned factors after ≥ 12 months of history.

#### Level 3 — Monte Carlo (P2)

5,000 iterations, daily spend sampled from a log-normal fit. Outputs P10/P50/P90 → fan chart. `shortfall_probability` = fraction of runs dropping below 0.

#### Cold-start policy

| Data age | Method | Confidence |
|---|---|---|
| 0–6 days | Recurring only | 🔴 Low — "Preliminary" |
| 7–29 days | Recurring + partial average | 🟡 Medium |
| 30+ days | Full formula + seasonality | 🟢 High |

Confidence MUST be visible on every forecast display.

#### Output contract

> ⚠️ *Reconstructed from the surrounding spec — verify against the original before use.*

```json
{
  "user_id": "usr_01H...",
  "computed_at": "2026-09-08T01:00:00+07:00",
  "method_version": "L2-v1",
  "level": 2,
  "balance_now": 45200.00,
  "projected_eoy_balance": 12400.00,
  "runway_date": null,
  "shortfall_probability": 0.23,
  "confidence": "high",
  "inputs": {
    "median_daily_spend": 420.00,
    "days_remaining": 114,
    "recurring_in_remaining": 105000.00,
    "recurring_out_remaining": 88000.00,
    "seasonality_factors": { "9": 1.00, "10": 1.00, "11": 1.10, "12": 1.25 }
  }
}
```

---

### S6 — Database

**Engine:** PostgreSQL 15+

> ⚠️ *The DDL blocks below were missing from the source document and are reconstructed from field references elsewhere in this spec. Treat as a draft — reconcile with `prisma/schema.prisma` before migrating.*

#### Core tables

```sql
CREATE TABLE users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id       TEXT UNIQUE NOT NULL,
  display_name       TEXT,
  timezone           TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  initial_balance    DECIMAL(12,2) NOT NULL DEFAULT 0,
  current_balance    DECIMAL(12,2) NOT NULL DEFAULT 0,
  ai_enabled         BOOLEAN NOT NULL DEFAULT false,
  notify_enabled     BOOLEAN NOT NULL DEFAULT false,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = system category
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('income','expense')),
  icon        TEXT,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id   UUID REFERENCES categories(id),
  amount        DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  type          TEXT NOT NULL CHECK (type IN ('income','expense')),
  occurred_at   TIMESTAMPTZ NOT NULL,
  note          TEXT CHECK (char_length(note) <= 500),
  source        TEXT NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('manual','line','email','recurring')),
  parsed_by     TEXT CHECK (parsed_by IN ('regex','dictionary','learned','ai')),
  confidence    NUMERIC(3,2),
  is_transfer   BOOLEAN NOT NULL DEFAULT false,
  is_auto       BOOLEAN NOT NULL DEFAULT false,
  status        TEXT NOT NULL DEFAULT 'confirmed'
                  CHECK (status IN ('pending','confirmed')),
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE recurring_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id  UUID REFERENCES categories(id),
  label        TEXT NOT NULL,
  amount       DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  type         TEXT NOT NULL CHECK (type IN ('income','expense')),
  frequency    TEXT NOT NULL CHECK (frequency IN ('weekly','monthly','yearly')),
  day_of_month SMALLINT,
  day_of_week  SMALLINT,
  start_date   DATE NOT NULL,
  end_date     DATE,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE budgets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id  UUID NOT NULL REFERENCES categories(id),
  period_month DATE NOT NULL,             -- first day of the month
  limit_amount DECIMAL(12,2) NOT NULL CHECK (limit_amount > 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, category_id, period_month)
);

CREATE TABLE user_keyword_map (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  keyword      TEXT NOT NULL,
  category_id  UUID NOT NULL REFERENCES categories(id),
  hit_count    INTEGER NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, keyword)
);

CREATE TABLE forecast_snapshots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  method_version        TEXT NOT NULL,
  level                 SMALLINT NOT NULL,
  balance_now           DECIMAL(12,2) NOT NULL,
  projected_eoy_balance DECIMAL(12,2) NOT NULL,
  runway_date           DATE,
  shortfall_probability NUMERIC(4,3),
  confidence            TEXT NOT NULL CHECK (confidence IN ('low','medium','high')),
  inputs                JSONB NOT NULL
);

CREATE TABLE webhook_events (
  id           TEXT PRIMARY KEY,          -- LINE webhookEventId
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  channel    TEXT NOT NULL CHECK (channel IN ('reply','push')),
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### Email-ingestion tables

```sql
CREATE TABLE ingest_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT UNIQUE NOT NULL,       -- >= 32 random bytes, never derived from user_id
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ
);

CREATE TABLE raw_emails (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_hash  TEXT UNIQUE NOT NULL,     -- idempotency key
  sender        TEXT NOT NULL,
  subject       TEXT,
  body_text     TEXT NOT NULL,
  received_at   TIMESTAMPTZ NOT NULL,
  spf_pass      BOOLEAN NOT NULL,
  dkim_pass     BOOLEAN NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','parsed_rule','parsed_ai','failed')),
  ai_attempted  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bank_transactions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw_email_id         UUID NOT NULL REFERENCES raw_emails(id) ON DELETE CASCADE,
  bank_code            TEXT NOT NULL,
  parser_version       TEXT,
  amount               DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  direction            TEXT NOT NULL CHECK (direction IN ('in','out')),
  occurred_at          TIMESTAMPTZ NOT NULL,
  merchant_raw         TEXT,
  merchant_clean       TEXT,
  balance_after        DECIMAL(12,2),
  bank_ref             TEXT,
  extracted_by         TEXT NOT NULL CHECK (extracted_by IN ('regex','ai')),
  confidence           NUMERIC(3,2),
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','confirmed','merged','failed')),
  matched_transaction_id UUID REFERENCES transactions(id),
  is_transfer          BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### 🆕 AI tables

```sql
CREATE TABLE ai_cache (
  cache_key   TEXT PRIMARY KEY,           -- hash(task + normalized input)
  task        TEXT NOT NULL,              -- T1 | T2 | T3 | T4
  result      JSONB NOT NULL,
  hit_count   INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE ai_usage_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  task           TEXT NOT NULL,
  provider       TEXT,
  model          TEXT,
  cache_hit      BOOLEAN NOT NULL DEFAULT false,
  prompt_tokens  INTEGER,
  output_tokens  INTEGER,
  cost_thb       DECIMAL(12,4) NOT NULL DEFAULT 0,
  latency_ms     INTEGER,
  success        BOOLEAN NOT NULL,
  error_code     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE merchant_dictionary (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_raw   TEXT UNIQUE NOT NULL,    -- normalized POS code
  merchant_clean TEXT NOT NULL,
  category_id    UUID REFERENCES categories(id),
  confidence     NUMERIC(3,2) NOT NULL,
  source         TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai','manual')),
  hit_count      INTEGER NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### Required indexes

```sql
CREATE INDEX idx_txn_user_date      ON transactions (user_id, occurred_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_txn_user_category  ON transactions (user_id, category_id);
CREATE INDEX idx_txn_user_status    ON transactions (user_id, status);
CREATE INDEX idx_recurring_active   ON recurring_rules (user_id, is_active);
CREATE INDEX idx_forecast_user_time ON forecast_snapshots (user_id, computed_at DESC);
CREATE INDEX idx_raw_email_user     ON raw_emails (user_id, received_at DESC);
CREATE INDEX idx_raw_email_status   ON raw_emails (status);
CREATE INDEX idx_bank_txn_user_date ON bank_transactions (user_id, occurred_at DESC);
CREATE INDEX idx_bank_txn_status    ON bank_transactions (user_id, status);
CREATE INDEX idx_bank_txn_ref       ON bank_transactions (user_id, bank_ref);
CREATE INDEX idx_ai_cache_expiry    ON ai_cache (expires_at);
CREATE INDEX idx_ai_usage_time      ON ai_usage_log (created_at DESC);
CREATE INDEX idx_ai_usage_user_day  ON ai_usage_log (user_id, created_at DESC);
CREATE INDEX idx_keyword_lookup     ON user_keyword_map (user_id, keyword);
```

#### Data rules

- MUST use `DECIMAL(12,2)` for money. `FLOAT`/`REAL` is forbidden.
- MUST use `TIMESTAMPTZ`.
- Amounts always positive; direction carried by `type` / `direction`.
- `is_transfer = true` rows are excluded from spend stats and forecasting.
- 🆕 Any row with `parsed_by = 'ai'` or `extracted_by = 'ai'` MUST also store a `confidence` value.

---

### S7 — Scheduler

| Job | Schedule | Description |
|---|---|---|
| `materialize-recurring` | Daily 00:30 (user TZ) | Create transactions from due rules |
| `compute-forecast` | Daily 01:00 | Write `forecast_snapshots` |
| `check-alerts` | Daily 08:00 (user TZ) | Critical events → Push within quota |
| 🆕 `ai-budget-check` | Hourly | Sum `ai_usage_log`; disable AI on cap breach |
| 🆕 `ai-cache-cleanup` | Weekly Sun 02:00 | Purge expired `ai_cache` rows |
| 🆕 `generate-insights` | Monthly, 1st 09:00 | Batch-generate insights for opted-in users |
| `cleanup` | Weekly Sun 03:00 | Purge `raw_emails` > 180 days, VACUUM |

All jobs MUST be idempotent and respect each user's timezone.

---

### S8 — Email Ingestion

**Chosen approach for v1:** Email Forwarding (not Gmail API).

**Rationale:** `gmail.readonly` is a restricted scope requiring annual CASA Tier-2 assessment (~$540+), and Testing-mode refresh tokens expire every 7 days. Forwarding avoids both and limits access to only forwarded bank emails rather than an entire mailbox.

**User setup (one time):**

1. Enable email notifications in K PLUS: อื่นๆ → การตั้งค่า → แอปพลิเคชัน → การแจ้งเตือน → การแจ้งเตือนทางอีเมล
2. Gmail filter: `from:(kasikornbank.com)` → forward to `ingest+{token}@{domain}`
3. Confirm the forwarding verification email

**Server pipeline:**

```
Inbound email (Cloudflare Email Worker)
  ↓
1. Verify SPF / DKIM / DMARC        → reject on failure
2. Verify sender domain ∈ whitelist → reject otherwise
3. Resolve ingest_token → user_id   → reject if unknown/inactive
4. Compute message_hash             → skip if exists (idempotency)
5. Persist to raw_emails (status='pending')
6. Enqueue → S9 Bank Parser
```

**Security requirements (non-negotiable):**

- MUST validate SPF/DKIM — otherwise anyone knowing the ingest address can inject fabricated transactions.
- `ingest_token` MUST be ≥ 32 cryptographically random bytes, never derived from `user_id`.
- Any OAuth refresh token MUST be encrypted at rest (envelope encryption). Plaintext is forbidden.
- Sample emails in the repo MUST be redacted.

---

### S9 — Bank Parser 🆕 (major update — AI-assisted)

**Design:** Strategy Pattern + two-tier extraction.

```typescript
interface BankParser {
  bankCode: string;
  version: string;
  canParse(email: RawEmail): boolean;
  parse(email: RawEmail): ParsedBankTxn | ParseFailure;
}
```

#### Two-tier extraction pipeline 🆕

| Tier | Method | When it runs | Cost |
|---|---|---|---|
| R1 | Regex (`KPlusParser`) | Always, first | Free |
| R2 | AI extraction (S11) | Only when R1 fails or is incomplete | Paid |

```
raw_email
   ↓
R1: KPlusParser.parse()
   ├── ✅ success + all required fields → status='parsed_rule'
   │                                      extracted_by='regex'
   └── ❌ fail / missing amount|date|direction
          ↓
       AI enabled? budget OK? ai_attempted=false?
          ├── no  → status='failed' → /pending manual review
          └── yes ↓
       R2: S11.extractFromEmail()
          ├── ✅ schema-valid → status='parsed_ai'
          │                     extracted_by='ai'
          │                     status='pending' (ALWAYS needs confirmation)
          └── ❌ → status='failed' → /pending manual review
```

> 🔴 **Rule:** AI-extracted bank transactions are ALWAYS `pending`. They are never auto-confirmed regardless of reported confidence. The user must approve via LINE Flex or `/pending`. This is the primary defense against AI hallucination corrupting financial data.

#### Why AI is the fallback, not the primary

| | Regex | AI |
|---|---|---|
| Accuracy on known template | ~100% | ~90–95% |
| Speed | < 1 ms | 1–3 s |
| Cost | Free | Paid |
| Handles template change | ❌ breaks | ✅ adapts |
| Deterministic | ✅ | ❌ |

**Conclusion:** Regex handles the 95% steady state. AI exists to keep the system alive during the days or weeks between a K PLUS template change and a developer shipping a new regex rule — which is precisely the failure mode that would otherwise cause silent data loss.

#### Extracted fields

| Field | Required | Notes |
|---|---|---|
| `amount` | ✅ | |
| `direction` | ✅ | `in` / `out` |
| `occurred_at` | ✅ | Convert to `Asia/Bangkok` |
| `merchant_raw` | ⬜ | Often a POS code |
| 🆕 `merchant_clean` | ⬜ | Normalized by S11 Task 2 |
| `balance_after` | ⬜ | Used by S10 reconciliation |
| `bank_ref` | ⬜ | Preferred dedup key |

#### Robustness requirements

- Raw body MUST be persisted **before** parsing → enables re-parse after template changes.
- Parser rules are versioned; `parser_version` stored per row.
- 🆕 Sentry alert when the 24h regex failure rate exceeds 10% — this signals a K PLUS template change and should trigger a new regex rule, not permanent AI reliance.
- 🆕 Weekly report: count of `parsed_ai` rows. A rising trend means regex rules are stale and must be updated. **AI is a bridge, not a destination.**
- Failed parses go to `/pending`, never silently dropped.

#### 🆕 Cost control for email AI

- Max 1 AI attempt per email (`ai_attempted` flag prevents retry loops).
- Max 50 AI email extractions per day system-wide.
- Email body truncated to 2,000 characters before submission.
- HTML stripped to plain text first.

#### Known limitations

- Bank emails carry no category → S11 Task 2 + S4 dictionary handle inference.
- Cash transactions are invisible → manual entry remains necessary.
- Self-transfers appear as expenses → handled by S10.

---

### S10 — Reconciliation

> 🔴 🆕 **Strictly AI-free.** Matching logic must be deterministic and auditable. A false merge silently destroys financial data with no error trace.

**1. Duplicate matching** — Match a `bank_transaction` to an existing `transaction` when all hold:

- `amount` exactly equal, **and**
- `|occurred_at difference| ≤ 30 minutes`, **and**
- `direction` matches

→ `status = 'merged'`, link `matched_transaction_id`, upgrade original `source` to `'email'` (higher trust).

**2. Internal transfer detection** — An `out` and an `in` of identical amount within 10 minutes across the user's own accounts → both marked `is_transfer = true`, excluded from spend metrics.

**3. Balance reconciliation** — When `balance_after` is present, compare to `users.current_balance`. On divergence beyond tolerance, surface: "Detected ฿1,240 in unrecorded activity — review?"

**Confidence policy:**

| Condition | Action |
|---|---|
| High (unique `bank_ref`, regex-extracted) | Auto-confirm, silent |
| Medium | `pending` + LINE Flex confirmation |
| 🆕 AI-extracted (`extracted_by='ai'`) | **Always `pending` — no exceptions** |
| Low / parse failure | Hold in `/pending` |

---

### 🆕 S11 — AI Service

**Responsibility:** Single, centralized gateway for every model call in the system. No other module may call an AI provider directly.

#### 3.11.1 Architecture

```
┌────────────────────────────────────────────────┐
│              S11: AI Service                    │
├────────────────────────────────────────────────┤
│  ① GUARD LAYER  (runs before every call)        │
│     1. ai_enabled?          → else fallback     │
│     2. Cache lookup         → return if hit     │
│     3. Rate limit check     → 20/user/day       │
│     4. Monthly budget check → circuit breaker   │
│     5. PII redaction        → mandatory         │
├────────────────────────────────────────────────┤
│  ② TASK ROUTER                                  │
│     T1 parseTransactionText()   ← S4 L4         │
│     T2 normalizeMerchant()      ← S9            │
│     T3 extractFromEmail()       ← S9 R2  🆕     │
│     T4 generateInsight()        ← S3/S7         │
├────────────────────────────────────────────────┤
│  ③ PROVIDER ADAPTER   (swappable, env-driven)   │
├────────────────────────────────────────────────┤
│  ④ VALIDATOR + FALLBACK                         │
│     • Zod schema validation                     │
│     • Range / sanity checks                     │
│     • On failure → deterministic fallback       │
│     • Log to ai_usage_log (always)              │
└────────────────────────────────────────────────┘
```

#### 3.11.2 Tasks

**T1 — `parseTransactionText`** (caller: S4 L4)

Input: raw Thai text. Output:

> ⚠️ *Reconstructed from the surrounding spec — verify against the original before use.*

```json
{
  "transactions": [
    {
      "amount": 890.00,
      "type": "expense",
      "category_hint": "ค่าไฟ",
      "note": "จ่ายค่าไฟ",
      "occurred_at": "2026-09-08T00:00:00+07:00",
      "confidence": 0.88
    },
    {
      "amount": 210.00,
      "type": "expense",
      "category_hint": "ค่าน้ำ",
      "note": "ค่าน้ำ",
      "occurred_at": "2026-09-08T00:00:00+07:00",
      "confidence": 0.86
    }
  ]
}
```

**T2 — `normalizeMerchant`** (caller: S9) — *highest ROI task*

```
"POS 7-11 SUKHUMV 42"  → { clean: "7-Eleven", category: "ของใช้",     confidence: 0.95 }
"GRABPAY*XXXXXXX"      → { clean: "Grab",      category: "เดินทาง",   confidence: 0.80 }
"BIGC SUPERCEN CHIDLOM"→ { clean: "Big C",     category: "ซูเปอร์มาร์เก็ต", confidence: 0.93 }
```

Results are written to the global `merchant_dictionary` — one AI call benefits all users forever. Expected cache hit rate exceeds 90% after the first month.

**🆕 T3 — `extractFromEmail`** (caller: S9 R2)

Input: sender, subject, plain-text body (≤ 2,000 chars, PII-redacted).

```json
{
  "amount": 1250.00,
  "direction": "out",
  "occurred_at": "2026-09-08T14:32:00+07:00",
  "merchant_raw": "POS BIGC CHIDLOM",
  "balance_after": 45200.00,
  "bank_ref": "TXN20260908143200",
  "confidence": 0.91
}
```

**Hard constraints:**

- Prompt MUST instruct: *"Extract only. Do not infer, estimate, or calculate any value not literally present. Return null for absent fields."*
- Output MUST pass Zod validation before persistence.
- Sanity checks: `0 < amount ≤ 10,000,000`; `occurred_at` within ±7 days of `received_at`; `direction ∈ {in, out}`.
- Any failed check → discard result, mark `failed`, route to manual review.
- Result always lands as `status = 'pending'`.

**T4 — `generateInsight`** (caller: S3 / S7)

> 🔴 AI receives **pre-computed aggregates only** — never raw transactions.

```
❌ FORBIDDEN: "Here are 200 transactions, analyze them."
✅ REQUIRED:  { spend_this_month: 24500, avg_3mo: 20800,
                top_category: {name:"food", amount:8200, usual:5100},
                forecast_eoy: 12400, shortfall_prob: 0.23 }
              → "Write 2 sentences in Thai. Do not invent numbers."
```

Output is prose only. Every figure in it must already exist in the input payload — validated by a post-check that extracts numerals from the output and confirms each appears in the input.

#### 3.11.3 Guard Layer requirements

| Guard | Rule |
|---|---|
| Cache-first | Every task MUST check `ai_cache` before any provider call |
| Rate limit | 20 AI calls per user per day (T1/T4); T3 capped at 50/day system-wide |
| Budget breaker | Hourly job sums `ai_usage_log.cost_thb`; on reaching `AI_MONTHLY_BUDGET_THB`, set `AI_ENABLED=false` and alert the team |
| PII redaction | Strip account numbers, card numbers, phone numbers, national IDs, and full names before any outbound call |
| Timeout | 8 s hard timeout → fallback |
| Retry | Max 1 retry, exponential backoff |
| Logging | Every call logged to `ai_usage_log`, including cache hits |

#### 3.11.4 Non-negotiable rules

- 🔴 AI must **never compute a number** that affects balance or forecast. It may extract a number that is literally present in text, and it may narrate numbers supplied to it. Nothing else.
- 🔴 Total failure of the AI provider must not break any feature. With `AI_ENABLED=false`, every P0 feature must still function. AI removal degrades convenience, never correctness.
- 🔴 All AI output passes Zod validation. Invalid output is discarded, never persisted.
- 🔴 AI-derived financial records are always `pending`. Human confirmation is mandatory.
- 🟠 All AI-facing content is labeled with ✨ AI in the UI.
- 🟠 AI is opt-in per user (`users.ai_enabled`), disableable in `/settings`.

#### 3.11.5 Explicitly excluded from AI

| Task | Reason | Implementation instead |
|---|---|---|
| Forecast calculation | Non-deterministic; users lose trust if the same data yields different answers | Math + Monte Carlo (S5) |
| Duplicate detection | Requires exact, auditable matching | Fuzzy match, amount + 30-min window (S10) |
| Internal transfer detection | Deterministic pattern | Rule-based (S10) |
| Simple category lookup | Dictionary answers in microseconds, free | `user_keyword_map` (S4 L2/L3) |
| Recurring-pattern detection | Statistics outperform AI here and cost nothing | `GROUP BY` + interval analysis |
| Anomaly detection | Z-score / IQR is explainable and free | Statistics |
| General chat | Not core value; unbounded cost | Not implemented |

**Guiding principle:** If the task demands a correct, repeatable answer → write code. If the task demands understanding unpredictable human input → use AI.

#### 3.11.6 Cost model

Assumption: 20 users × 5 entries/day.

| Task | Raw calls/mo | After cache | Notes |
|---|---|---|---|
| T1 parse fallback | ~300 | ~150 | Shrinks as dictionary grows |
| T2 merchant | ~600 | ~60 | ~90% cache hit; global dictionary |
| T3 email extract | ~30 | ~30 | Spikes only on template change |
| T4 insight | ~40 | ~40 | Longer prompts, low volume |
| **Total** | **~970** | **~280** | Within budget with a small model |

**Requirement:** a hard spending cap MUST be configured in the provider dashboard **in addition to** the in-code breaker. Code-level limits can be defeated by a bug; provider-level caps cannot.

---

## 4. Feature Inventory

### P0 — Must-have

| # | Feature |
|---|---|
| 1 | Onboarding (initial balance + recurring setup) |
| 2 | Chat-based logging via LINE |
| 3 | Web form entry |
| 4 | Transaction CRUD + filtering |
| 5 | Categories (system + custom) |
| 6 | Recurring rules |
| 7 | Auto-computed current balance |
| 8 | EOY forecast (Level 1 + 2) |
| 9 | LINE Login authentication |
| 10 | K PLUS email ingestion (regex tier) |

### P1 — Should-have

| # | Feature |
|---|---|
| 11 | Dashboard with category / monthly charts |
| 12 | Forecast line chart |
| 13 | Shortfall probability display |
| 14 | Runway date |
| 15 | Category budgets + progress |
| 16 | `สรุป` chat summary (Flex) |
| 17 | Daily push notification (opt-in) |
| 18 | Self-learning parser corrections |
| 19 | CSV / JSON export |
| 20 | Transaction search |
| 21 | Pending bank transaction review UI |
| 22 | Internal transfer detection |
| 🆕 23 | AI merchant normalization (T2) |
| 🆕 24 | AI text parser fallback (T1) |

### P2 — Nice-to-have

| # | Feature |
|---|---|
| 🆕 25 | AI email extraction fallback (T3) |
| 🆕 26 | AI insight generator (T4) |
| 🆕 27 | AI usage / cost dashboard (internal) |
| 28 | What-if simulator (slider) |
| 29 | Monte Carlo + fan chart |
| 30 | Goal tracker |
| 31 | Anomaly detection (statistical) |
| 32 | Forecast accuracy scorecard |
| 33 | Additional bank parsers (SCB, KTB) |
| 34 | Receipt OCR |
| 35 | Dark mode / PWA |

---

## 5. Roadmap (10 Weeks)

| Week | Goal | Definition of Done |
|---|---|---|
| 1 | Foundation | Repo + CI green, DB schema merged, LINE channels created, OpenAPI draft agreed |
| 2 | Auth | LINE Login end-to-end; webhook signature verification passes; session persists |
| 3 | Transactions (web) | Full CRUD from browser; balance recomputes correctly |
| 4 | Transactions (chat) | `กาแฟ 80` appears on dashboard; Flex confirm/correct works |
| 5 | Recurring + Onboarding | New user completes onboarding; rules materialize via cron |
| 6 | Forecast v1 | EOY card renders in web + chat with confidence badge |
| 7 | Dashboard + Budgets | Charts, budgets, search, export |
| 8 | Email ingestion (regex) | Forwarded K PLUS email → `bank_transactions` via R1 |
| 9 | Reconciliation + 🆕 AI Layer | Dedup + transfer detection working; S11 guard layer, cache, T1, T2 live |
| 10 | 🆕 AI T3/T4 + Polish + Test | AI email fallback verified against a deliberately broken template; insights render; internal testing |

**Buffer policy:** If a week slips, cut from P2 first, then P1. Weeks 6, 8, and 9 must not be cut.
🆕 **AI rule:** S11 MUST NOT begin before Week 9. Rule-based paths must be proven first — otherwise AI becomes an expensive crutch masking weak fundamentals.

---

## 6. Team Allocation

| Member | Role | Owns |
|---|---|---|
| A | Backend Lead | S1 Gateway, S3.1 Auth, deployment, security review |
| B | Backend | S3.2–3.4, S6 schema/migrations, S10 Reconciliation |
| C | Backend / Data | S4 Parser, S5 Forecast, S7 Scheduler, 🆕 S11 AI Service |
| D | Frontend Lead | S2 architecture, dashboard, charts |
| E | Frontend / UX | Onboarding, forms, Flex design, QA, 🆕 AI badges + insight cards |
| A + C | Shared | S8 Email Ingestion, S9 Bank Parser (R1 + R2) |

**Critical coordination:** B ↔ D on API contracts — write the OpenAPI spec in Week 1.
🆕 C owns the entire AI budget. No other member may add a provider call without C's review.

---

## 7. Engineering Conventions

**Git** — `main` (protected) ← `dev` ← `feat/*`, `fix/*`. Conventional Commits. 1 approval + green CI required.

**Code** — TypeScript `strict: true`; ESLint + Prettier in CI; all money as `Decimal` (Prisma), never JS `number` arithmetic.

**Testing**

- Unit tests required for S4, S5, S9, S10, 🆕 S11.
- Parser tests use redacted fixture files.
- 🆕 AI tests MUST mock the provider — no real calls in CI.
- 🆕 Golden-set test: 30 redacted K PLUS emails; regex tier must achieve ≥ 95% extraction accuracy.
- 🆕 Broken-template test: deliberately corrupt a fixture; assert R2 (AI) is invoked and produces a `pending` row.
- Target ≥ 70% coverage on those five modules.

**Environment variables**

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

# 🆕 AI
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

`.env.example` MUST be committed. `.env` MUST NOT be.

---

## 8. Security Requirements

| ID | Requirement | Severity |
|---|---|---|
| SEC-1 | Verify `X-Line-Signature` on every webhook | 🔴 Critical |
| SEC-2 | Verify OAuth `state` (CSRF) | 🔴 Critical |
| SEC-3 | Verify `id_token` signature, `iss`, `aud`, `exp`, `nonce` | 🔴 Critical |
| SEC-4 | Session in `httpOnly` + `secure` + `sameSite` cookie | 🔴 Critical |
| SEC-5 | Never trust client-supplied `userId` | 🔴 Critical |
| SEC-6 | Verify SPF/DKIM on inbound email | 🔴 Critical |
| SEC-7 | `ingest_token` ≥ 32 random bytes | 🟠 High |
| SEC-8 | Encrypt any OAuth refresh token at rest | 🟠 High |
| SEC-9 | Rate limit 60 req/min per user | 🟠 High |
| SEC-10 | Row-level authorization on every query | 🔴 Critical |
| SEC-11 | Redact PII in logs and Sentry | 🟠 High |
| SEC-12 | Data export + hard delete endpoints | 🟡 Medium |
| 🆕 SEC-13 | PII redaction before every AI call (account/card/phone/ID/full name) | 🔴 Critical |
| 🆕 SEC-14 | Never send raw transaction history to AI — aggregates only | 🔴 Critical |
| 🆕 SEC-15 | Validate all AI output against Zod schema before persistence | 🔴 Critical |
| 🆕 SEC-16 | AI is opt-in per user, disableable at any time | 🟠 High |
| 🆕 SEC-17 | Hard spending cap in provider dashboard, not only in code | 🟠 High |
| 🆕 SEC-18 | AI API key server-side only — never exposed to the client | 🔴 Critical |

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| K PLUS changes email template | Parser silently breaks | Persist `raw_email`; >10% failure alert; 🆕 AI R2 keeps ingestion alive while a new regex rule is written |
| LINE Push quota exceeded | Notifications stop | Reply-first design; `notification_log` counter; opt-in only |
| Parser accuracy too low | Users abandon | Confirm/correct buttons + learned dictionary + AI L4 |
| Forecast cold start | Users distrust numbers | Explicit confidence badges |
| Duplicate transactions | Balance drift | S10 fuzzy matching, 30-min window |
| Self-transfers counted as spend | Forecast inflated | `is_transfer` flag + detection |
| Vercel Hobby ToS | Account suspension | Remain non-commercial |
| Email forwarding misconfigured | Silent data loss | Health check: warn if no email in 7 days |
| 🆕 AI cost overrun | Budget blown | Cache-first + rate limit + hourly breaker + provider-level cap |
| 🆕 AI hallucinates a transaction | Corrupted financial data | Zod validation + sanity ranges + always `pending` + human confirmation |
| 🆕 Over-reliance on AI for email | Regex rules rot; cost creeps up | Weekly `parsed_ai` count report; rising trend triggers a regex-update task |
| 🆕 AI provider outage | Feature degradation | Full deterministic fallback; all P0 features work with `AI_ENABLED=false` |
| 🆕 Privacy concern | Trust loss | PII redaction + aggregates only + per-user opt-in + clear disclosure |

---

## 10. Success Criteria

At the end of Week 10, the project is successful if:

1. A user completes onboarding and logs a transaction via both LINE chat and the web app.
2. A forwarded K PLUS email is parsed and appears as a transaction without manual entry.
3. The dashboard displays an EOY forecast with a visible confidence level.
4. Duplicate transactions between chat entry and email ingestion are correctly merged.
5. All 🔴 Critical security requirements are implemented and reviewed.
6. At least 5 team members use the system for 2 consecutive weeks with real data.
7. 🆕 With `AI_ENABLED=false`, **every P0 feature still works.** (This is the definitive test that AI is an enhancement, not a dependency.)
8. 🆕 Monthly AI spend stays within `AI_MONTHLY_BUDGET_THB`.
9. 🆕 On a deliberately corrupted email template, the AI fallback successfully extracts the transaction as `pending`.

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| EOY | End of Year — Dec 31 of the current year |
| Runway date | Projected date on which balance reaches zero |
| Recurring rule | A repeating income/expense definition used for forecasting |
| Materialize | Converting a recurring rule into an actual transaction on its due date |
| Reconciliation | Matching bank-sourced records against user-entered records |
| Confidence level | Qualitative indicator of forecast reliability based on data volume |
| Ingest token | Random secret embedded in the forwarding address identifying the user |
| 🆕 Guard Layer | Pre-flight checks (cache, rate limit, budget, redaction) before any AI call |
| 🆕 Circuit breaker | Automatic AI shutdown on budget cap breach |
| 🆕 R1 / R2 | Bank parser tiers — R1 regex (primary), R2 AI (fallback) |
| 🆕 Cache-first | Mandatory `ai_cache` lookup preceding every provider call |

---

## Appendix B — 🆕 AI Decision Matrix

| Task | AI? | Rationale |
|---|---|---|
| Parse simple text (`กาแฟ 80`) | ❌ | Regex is instant and free |
| Parse complex Thai text | ✅ T1 | Unbounded input variety |
| Normalize merchant codes | ✅ T2 | Highest ROI; global cache |
| Extract from known email template | ❌ | Regex is 100% accurate |
| Extract from broken/changed template | ✅ T3 | Only viable resilience mechanism |
| Categorize transactions | ⚠️ Partial | Dictionary first, AI only on miss |
| Compute forecast | ❌ | Must be deterministic |
| Narrate forecast in Thai | ✅ T4 | Language, not arithmetic |
| Detect duplicates | ❌ | Requires exact matching |
| Detect recurring patterns | ❌ | `GROUP BY` outperforms AI |
| Detect anomalies | ❌ | Z-score is explainable and free |

---

*Document version: 1.1 — 2026-09-08*
*Changelog: Added S11 AI Service; S9 two-tier extraction (R1 regex / R2 AI); AI tables (`ai_cache`, `ai_usage_log`, `merchant_dictionary`); SEC-13→18; AI risk register; Appendix B decision matrix*
