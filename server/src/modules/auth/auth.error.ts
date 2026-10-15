export type AuthErrorCode =
  'INVALID_CREDENTIALS' | 'UNAUTHENTICATED' | 'FORBIDDEN_ROLE' | 'RATE_LIMITED';

/** Every auth refusal; the edge translates `code` into the HTTP status and public message. */
export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// Same code for unknown e-mail and wrong password: telling them apart enumerates accounts.
export class InvalidCredentialsError extends AuthError {
  constructor(readonly email: string) {
    super('INVALID_CREDENTIALS', `no account accepts the password given for e-mail ${email}`);
  }
}

export class UnauthenticatedError extends AuthError {
  constructor(readonly received: 'no session cookie' | 'an unknown or expired session') {
    super('UNAUTHENTICATED', `a valid session cookie is required; received ${received}`);
  }
}

export class ForbiddenRoleError extends AuthError {
  constructor(
    readonly userId: string,
    readonly role: string,
    readonly required: string,
  ) {
    super(
      'FORBIDDEN_ROLE',
      `user ${userId} has role ${role}; this route requires role ${required}`,
    );
  }
}

export class RateLimitedError extends AuthError {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED', `too many login attempts; retry after ${retryAfterSeconds} s`);
  }
}
