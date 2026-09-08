/**
 * Server environment, validated once at startup (SPEC §7).
 *
 * A missing LINE secret must fail the boot, not the first webhook. AI
 * configuration is deliberately absent here — it lives in
 * `src/modules/ai/env.ts` so that SEC-18 (server-side key, S11 only) is
 * enforced by the module boundary rather than by discipline.
 */
import { z } from 'zod';

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().url(),

  LINE_CHANNEL_ID: z.string().min(1),
  LINE_CHANNEL_SECRET: z.string().min(1),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1),
  LINE_LOGIN_CHANNEL_ID: z.string().min(1),
  LINE_LOGIN_CHANNEL_SECRET: z.string().min(1),

  NEXTAUTH_URL: z.string().url(),
  // SEC-4: the session cookie is signed with this; a short secret is a weak signature.
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),

  EMAIL_INGEST_DOMAIN: z.string().min(1).optional(),
  EMAIL_WORKER_SECRET: z.string().min(1).optional(),

  SENTRY_DSN: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    // Names only — never the values, which are secrets.
    const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid server environment: ${missing}. See .env.example.`);
  }

  cached = parsed.data;
  return cached;
}
