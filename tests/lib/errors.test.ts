import { describe, expect, it } from 'vitest';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ValidationError,
  isAppError,
  toAppError,
} from '@/lib/errors';

describe('AppError', () => {
  it('maps a code to an HTTP status', () => {
    expect(new ValidationError('bad amount').status).toBe(400);
    expect(new ForbiddenError().status).toBe(403);
    expect(new NotFoundError().status).toBe(404);
    expect(new RateLimitError('slow down', 60).status).toBe(429);
  });

  it('keeps context out of the response body', () => {
    const error = new ValidationError('Amount must be positive', { userId: 'usr_01H' });
    expect(error.toResponseBody()).toEqual({
      error: { code: 'VALIDATION_FAILED', message: 'Amount must be positive' },
    });
    expect(JSON.stringify(error.toResponseBody())).not.toContain('usr_01H');
  });

  it('makes forbidden and not-found indistinguishable from outside', () => {
    // SEC-10: a distinct 403 message would confirm that another user's row
    // exists at that id.
    expect(new ForbiddenError().message).toBe(new NotFoundError().message);
  });

  it('carries a retry hint on rate limiting', () => {
    expect(new RateLimitError('slow down', 60).retryAfterSeconds).toBe(60);
    expect(new RateLimitError('slow down').retryAfterSeconds).toBeUndefined();
  });
});

describe('toAppError', () => {
  it('passes an AppError through unchanged', () => {
    const original = new ValidationError('bad amount');
    expect(toAppError(original)).toBe(original);
  });

  it('hides an unknown error message from the client but keeps it for logs', () => {
    const converted = toAppError(new Error('relation "users" does not exist'));
    expect(converted.status).toBe(500);
    expect(converted.toResponseBody().error.message).toBe('Something went wrong');
    expect(converted.context.cause).toBe('relation "users" does not exist');
  });

  it('handles a non-Error throw', () => {
    expect(toAppError('boom').context.cause).toBe('boom');
  });

  it('identifies AppErrors', () => {
    expect(isAppError(new AppError('INTERNAL', 'x'))).toBe(true);
    expect(isAppError(new Error('x'))).toBe(false);
  });
});
