/**
 * Typed errors. AIDO §8: never throw a bare string, never `catch (e) {}` —
 * a swallowed error in a money path is silent data corruption.
 */

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'AI_DISABLED'
  | 'AI_BUDGET_EXCEEDED'
  | 'AI_INVALID_OUTPUT'
  | 'PARSE_FAILED'
  | 'CONFLICT'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  RATE_LIMITED: 429,
  AI_DISABLED: 503,
  AI_BUDGET_EXCEEDED: 503,
  AI_INVALID_OUTPUT: 502,
  PARSE_FAILED: 422,
  CONFLICT: 409,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
  }
}

export const unauthorized = (m?: string) => new AppError('UNAUTHORIZED', m);
export const forbidden = (m?: string) => new AppError('FORBIDDEN', m);
export const notFound = (m?: string) => new AppError('NOT_FOUND', m);
