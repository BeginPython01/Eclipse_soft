/**
 * Typed application errors (AIDO §14: never `catch (e) {}`).
 *
 * Route handlers translate these into responses; modules throw them. The
 * distinction that matters for security: `AppError.message` is safe to send to
 * a client, everything else stays server-side. A 403 must never explain *why*
 * a row was not accessible — that leaks the existence of another user's data.
 */

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'UPSTREAM_FAILED'
  | 'AI_DISABLED'
  | 'AI_BUDGET_EXCEEDED'
  | 'AI_VALIDATION_FAILED'
  | 'INTERNAL';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UPSTREAM_FAILED: 502,
  AI_DISABLED: 503,
  AI_BUDGET_EXCEEDED: 503,
  AI_VALIDATION_FAILED: 502,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Extra context for logs and Sentry. Never serialized to the client. */
  readonly context: Readonly<Record<string, unknown>>;

  constructor(code: ErrorCode, message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.context = context;
  }

  /** The only shape that reaches a client. */
  toResponseBody(): { error: { code: ErrorCode; message: string } } {
    return { error: { code: this.code, message: this.message } };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('VALIDATION_FAILED', message, context);
    this.name = 'ValidationError';
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHENTICATED', message);
    this.name = 'UnauthenticatedError';
  }
}

/**
 * SEC-10. Thrown when a row exists but belongs to someone else.
 * The message is deliberately identical to a not-found message so the two
 * cases are indistinguishable from outside.
 */
export class ForbiddenError extends AppError {
  constructor(context?: Record<string, unknown>) {
    super('FORBIDDEN', 'Resource not available', context);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(context?: Record<string, unknown>) {
    super('NOT_FOUND', 'Resource not available', context);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('CONFLICT', message, context);
    this.name = 'ConflictError';
  }
}

/** SEC-9: 60 req/min per user. Also used by the S11 guard layer. */
export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number | undefined;

  constructor(message: string, retryAfterSeconds?: number, context?: Record<string, unknown>) {
    super('RATE_LIMITED', message, context);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class UpstreamError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('UPSTREAM_FAILED', message, context);
    this.name = 'UpstreamError';
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Normalize anything thrown into an AppError.
 * An unknown error becomes a generic 500 — its real message goes to the log,
 * never to the response, because it may contain a query fragment or a path.
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;

  const cause = error instanceof Error ? error.message : String(error);
  return new AppError('INTERNAL', 'Something went wrong', { cause });
}
