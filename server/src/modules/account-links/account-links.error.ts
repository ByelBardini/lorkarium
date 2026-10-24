export type AccountLinksErrorCode =
  | 'ACCOUNT_LINK_INVALID'
  | 'EMAIL_TAKEN'
  | 'ALREADY_INVITED'
  | 'INVITATION_NOT_FOUND'
  | 'USERNAME_TAKEN'
  | 'USER_NOT_FOUND'
  | 'SELF_ACTION'
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

export class AccountLinksRateLimitedError extends AccountLinksError {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED', `too many account link requests; retry after ${retryAfterSeconds} s`);
  }
}
