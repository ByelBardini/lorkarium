export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN_ROLE'
  | 'RATE_LIMITED'
  | 'TWO_FACTOR_CODE_INVALID'
  | 'TWO_FACTOR_CHALLENGE_EXPIRED';

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

// Outside AuthError on purpose: it never reaches the HTTP edge, so it has no status to map.
export class DevSeedRefusedError extends Error {
  readonly code = 'DEV_SEED_REFUSED';

  constructor(readonly nodeEnv: string) {
    super(`the dev players seed only runs outside production; received NODE_ENV=${nodeEnv}`);
    this.name = 'DevSeedRefusedError';
  }
}

export class RateLimitedError extends AuthError {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED', `too many login attempts; retry after ${retryAfterSeconds} s`);
  }
}

/** Why a second factor was refused; the code itself never goes into the message. */
export type TwoFactorRefusal =
  | 'no code matches the secret'
  | 'the code is outside the accepted window'
  | 'the code was already used'
  | 'the recovery code is unknown'
  | 'the recovery code was already used'
  | 'two-factor is not enabled';

export class TwoFactorCodeInvalidError extends AuthError {
  constructor(
    readonly userId: string,
    readonly refusal: TwoFactorRefusal,
  ) {
    super('TWO_FACTOR_CODE_INVALID', `second factor of user ${userId} refused: ${refusal}`);
  }
}

/** No challenge for the `lk_2fa` cookie: missing, unknown, past its 5 minutes or out of tries. */
export class TwoFactorChallengeExpiredError extends AuthError {
  constructor(
    readonly received:
      | 'no challenge cookie'
      | 'an unknown challenge'
      | 'an expired challenge'
      | 'a challenge out of attempts',
  ) {
    super(
      'TWO_FACTOR_CHALLENGE_EXPIRED',
      `a live two-factor challenge is required; received ${received}`,
    );
  }
}
