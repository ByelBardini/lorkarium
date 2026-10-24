export type UserAdminErrorCode =
  | 'SELF_ACTION'
  | 'USER_NOT_FOUND'
  | 'OWNS_SHARED_CAMPAIGNS'
  | 'MAIL_SAMPLE_NOT_FOUND'
  | 'MAIL_DELIVERY_FAILED'
  | 'RATE_LIMITED';

/** Every refusal of the backoffice's account routes; the edge maps `code` to status and message. */
export class UserAdminError extends Error {
  constructor(
    readonly code: UserAdminErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'UserAdminError';
  }
}

// Nobody suspends, demotes or deletes their own account by a slip; it also keeps one admin alive.
export class SelfActionError extends UserAdminError {
  constructor(
    readonly userId: string,
    readonly action: string,
  ) {
    super(
      'SELF_ACTION',
      `admin ${userId} cannot ${action} their own account; expected another account`,
    );
  }
}

export class UserNotFoundError extends UserAdminError {
  constructor(readonly userId: string) {
    super('USER_NOT_FOUND', `no account with id ${userId}`);
  }
}

export type BlockingCampaign = Readonly<{ id: string; name: string; otherMembers: number }>;

/** The account owns tables where other people play: deleting it would take them away. */
export class OwnsSharedCampaignsError extends UserAdminError {
  constructor(
    readonly userId: string,
    readonly blockingCampaigns: readonly BlockingCampaign[],
  ) {
    const names = blockingCampaigns.map((campaign) => campaign.name).join(', ');
    super(
      'OWNS_SHARED_CAMPAIGNS',
      `account ${userId} owns tables with other members (${names}); expected none to delete it`,
    );
  }
}

export class MailSampleNotFoundError extends UserAdminError {
  constructor(readonly sampleId: string) {
    super('MAIL_SAMPLE_NOT_FOUND', `no system e-mail sample with id ${sampleId}`);
  }
}

/** The mailer refused the sample (SMTP down, address refused): the admin sees it, unlike a notice. */
export class MailDeliveryFailedError extends UserAdminError {
  constructor(
    readonly subject: string,
    cause: unknown,
  ) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super('MAIL_DELIVERY_FAILED', `the sample "${subject}" was not delivered: ${reason}`);
    this.cause = cause;
  }
}

export class UserAdminRateLimitedError extends UserAdminError {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED', `too many backoffice requests; retry after ${retryAfterSeconds} s`);
  }
}
