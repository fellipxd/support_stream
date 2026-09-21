/** Predictable error taxonomy. Every layer throws these; the edge maps them to responses. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Authorisation failure. Reads surface as NotFound so existence is not disclosed. */
export class ForbiddenError extends AppError {
  constructor(message = 'You are not allowed to perform this action') {
    super(message, 'FORBIDDEN', 403);
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 'UNAUTHORIZED', 401);
  }
}
export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 'NOT_FOUND', 404);
  }
}
export class ValidationError extends AppError {
  constructor(message = 'Invalid input', details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 422, details);
  }
}
export class InvalidTransitionError extends AppError {
  constructor(from: string, to: string, reason?: string) {
    super(reason ?? `Cannot move a ticket from ${from} to ${to}`, 'INVALID_TRANSITION', 409, {
      from,
      to,
    });
  }
}
export class RateLimitError extends AppError {
  constructor(retryAfterSeconds: number) {
    super('Too many requests. Please try again shortly.', 'RATE_LIMITED', 429, {
      retryAfterSeconds,
    });
  }
}
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** Result type for action handlers that must not throw across the RSC boundary. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string; fieldErrors?: Record<string, string[]> };

export function toActionError(e: unknown): ActionResult<never> {
  if (isAppError(e)) {
    return {
      ok: false,
      error: e.message,
      code: e.code,
      fieldErrors: e.details?.fieldErrors as Record<string, string[]> | undefined,
    };
  }
  return { ok: false, error: 'Something went wrong. Please try again.', code: 'INTERNAL_ERROR' };
}
