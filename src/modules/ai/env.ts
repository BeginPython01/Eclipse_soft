/**
 * AI service configuration (S11).
 *
 * This is the only file in the codebase permitted to read AI_* variables
 * (SEC-18, AIDO §4) — enforced by scripts/check-ai-boundary.mjs in CI.
 * Nothing here is ever imported into a client component: the API key must not
 * reach the browser bundle.
 */
import { z } from 'zod';

const aiEnvSchema = z.object({
  /**
   * The master switch. With this false every P0 feature must still work —
   * that is the definitive test in SPEC §10 that AI is an enhancement, not a
   * dependency. Defaults to false so a missing variable degrades safely.
   */
  AI_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  AI_PROVIDER: z.string().min(1).optional(),
  AI_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).optional(),

  // SEC-17: mirrored by a hard cap in the provider dashboard — code alone is
  // not a spending control.
  AI_MONTHLY_BUDGET_THB: z.coerce.number().positive().default(80),
  AI_RATE_LIMIT_PER_USER_DAY: z.coerce.number().int().positive().default(20),
  AI_EMAIL_DAILY_LIMIT: z.coerce.number().int().positive().default(50),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(8_000),
  AI_CACHE_TTL_DAYS: z.coerce.number().int().positive().default(90),
});

export type AiEnv = z.infer<typeof aiEnvSchema>;

let cached: AiEnv | undefined;

export function getAiEnv(): AiEnv {
  if (cached) return cached;

  const parsed = aiEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid AI environment: ${missing}. See .env.example.`);
  }

  // Enabled but unconfigured is a deployment mistake that would otherwise
  // surface as a runtime failure on the first user message.
  if (parsed.data.AI_ENABLED && (!parsed.data.AI_PROVIDER || !parsed.data.AI_API_KEY)) {
    throw new Error('AI_ENABLED=true requires AI_PROVIDER and AI_API_KEY.');
  }

  cached = parsed.data;
  return cached;
}
