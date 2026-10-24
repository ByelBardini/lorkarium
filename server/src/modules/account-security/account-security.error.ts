export type AccountSecurityErrorCode =
  | 'CURRENT_PASSWORD_INVALID'
  | 'SESSION_NOT_FOUND'
  | 'CURRENT_SESSION'
  | 'EMAIL_UNCHANGED'
  | 'EMAIL_TAKEN'
  | 'EMAIL_TOKEN_INVALID'
  | 'TWO_FACTOR_ALREADY_ENABLED'
  | 'TWO_FACTOR_NOT_STARTED'
  | 'TWO_FACTOR_NOT_ENABLED'
  | 'RECOVERY_TOKEN_INVALID'
  | 'RATE_LIMITED';

/** Every refusal of the account's security routes; the edge maps `code` to status and message. */
export class AccountSecurityError extends Error {
  constructor(
    readonly code: AccountSecurityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AccountSecurityError';
  }
}

// 403, never 401: the client reads 401 as "the session fell" and would send the person to login.
export class CurrentPasswordInvalidError extends AccountSecurityError {
  constructor(readonly userId: string) {
    super('CURRENT_PASSWORD_INVALID', `the current password sent by user ${userId} does not match`);
  }
}

// Same code for "no such session" and "someone else's": telling them apart leaks which ids exist.
export class SessionNotFoundError extends AccountSecurityError {
  constructor(
    readonly userId: string,
    readonly publicId: string,
  ) {
    super('SESSION_NOT_FOUND', `user ${userId} has no session with public id ${publicId}`);
  }
}

export class CurrentSessionError extends AccountSecurityError {
  constructor(readonly publicId: string) {
    super(
      'CURRENT_SESSION',
      `session ${publicId} is the one making the request; expected another session (use logout)`,
    );
  }
}

export class EmailUnchangedError extends AccountSecurityError {
  constructor(readonly userId: string) {
    super('EMAIL_UNCHANGED', `the new e-mail of user ${userId} equals the current one`);
  }
}

export class EmailTakenError extends AccountSecurityError {
  constructor(readonly email: string) {
    super('EMAIL_TAKEN', `e-mail ${email} already belongs to another account`);
  }
}

export class EmailTokenInvalidError extends AccountSecurityError {
  constructor(readonly received: 'an unknown token' | 'an expired token') {
    super(
      'EMAIL_TOKEN_INVALID',
      `a live e-mail confirmation token is required; received ${received}`,
    );
  }
}

// One code for unknown, used and expired: telling them apart helps whoever guesses tokens.
export class RecoveryTokenInvalidError extends AccountSecurityError {
  constructor(readonly received: string) {
    super(
      'RECOVERY_TOKEN_INVALID',
      `a live account recovery token is required; received ${received}`,
    );
  }
}

export class TwoFactorStateError extends AccountSecurityError {
  constructor(
    code: 'TWO_FACTOR_ALREADY_ENABLED' | 'TWO_FACTOR_NOT_STARTED' | 'TWO_FACTOR_NOT_ENABLED',
    readonly userId: string,
    readonly state: 'enabled' | 'pending' | 'off',
  ) {
    super(code, `two-factor of user ${userId} is ${state}; ${code} refuses this step`);
  }
}

export class AccountRateLimitedError extends AccountSecurityError {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED', `too many account security requests; retry after ${retryAfterSeconds} s`);
  }
}
