export type AccountLinksErrorCode =
  | 'ACCOUNT_LINK_INVALID'
  | 'EMAIL_TAKEN'
  | 'EMAIL_BANNED'
  | 'ALREADY_INVITED'
  | 'INVITATION_NOT_FOUND'
  | 'USERNAME_TAKEN'
  | 'USER_NOT_FOUND'
  | 'SELF_ACTION'
  | 'REGISTRATION_CLOSED'
  | 'HUMAN_CHECK_FAILED'
  | 'RATE_LIMITED';

/** Every refusal of the invitation and new-password routes; the edge maps `code` to status. */
export class AccountLinksError extends Error {
  constructor(
    readonly code: AccountLinksErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AccountLinksError';
  }
}

// One code for unknown, used, cancelled and expired: telling them apart helps whoever guesses.
export class AccountLinkInvalidError extends AccountLinksError {
  constructor(readonly received: string) {
    super('ACCOUNT_LINK_INVALID', `a live account link is required; received ${received}`);
  }
}

export class EmailTakenError extends AccountLinksError {
  constructor(readonly email: string) {
    super('EMAIL_TAKEN', `e-mail ${email} already belongs to an account; expected a new address`);
  }
}

// Cites the blind index, never the address: the log of a refused invitation keeps no e-mail.
export class EmailBannedError extends AccountLinksError {
  constructor(readonly emailIndex: string) {
    super(
      'EMAIL_BANNED',
      `e-mail index ${emailIndex} is of an account deleted for a violation in the last 5 years; expected another address`,
    );
  }
}

export class AlreadyInvitedError extends AccountLinksError {
  constructor(
    readonly email: string,
    readonly invitationId: string,
  ) {
    super('ALREADY_INVITED', `e-mail ${email} already has invitation ${invitationId} pending`);
  }
}

export class InvitationNotFoundError extends AccountLinksError {
  constructor(readonly invitationId: string) {
    super('INVITATION_NOT_FOUND', `no pending invitation with id ${invitationId}`);
  }
}

export class UsernameTakenError extends AccountLinksError {
  constructor(readonly username: string) {
    super('USERNAME_TAKEN', `@${username} already belongs to an account; expected a free @`);
  }
}

export class LinkUserNotFoundError extends AccountLinksError {
  constructor(readonly userId: string) {
    super('USER_NOT_FOUND', `no account with id ${userId}`);
  }
}

export class LinkSelfActionError extends AccountLinksError {
  constructor(readonly userId: string) {
    super(
      'SELF_ACTION',
      `admin ${userId} cannot send a new-password link to their own account; expected another account`,
    );
  }
}

export class RegistrationClosedError extends AccountLinksError {
  constructor() {
    super(
      'REGISTRATION_CLOSED',
      'the public sign-up is closed (REGISTRATION_OPEN=false); expected an invitation from an admin',
    );
  }
}

// Cites the IP, never the address nor the token: the refusal must not tie a person to a form.
export class HumanCheckFailedError extends AccountLinksError {
  constructor(readonly remoteIp: string) {
    super(
      'HUMAN_CHECK_FAILED',
      `the anti-bot token from ${remoteIp} did not pass; expected a fresh Turnstile token`,
    );
  }
}

export class AccountLinksRateLimitedError extends AccountLinksError {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED', `too many account link requests; retry after ${retryAfterSeconds} s`);
  }
}
