export type CampaignErrorCode =
  | 'CAMPAIGN_NOT_FOUND'
  | 'CAMPAIGN_PASSWORD_REQUIRED'
  | 'CAMPAIGN_PASSWORD_INVALID'
  | 'CAMPAIGN_CODE_EXHAUSTED'
  | 'RATE_LIMITED'
  | 'INVALID_PARAMS'
  | 'FORBIDDEN';

/** Every campaign refusal; the edge translates `code` into the HTTP status and public message. */
export class CampaignError extends Error {
  constructor(
    readonly code: CampaignErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CampaignError';
  }
}

export type CampaignLookup =
  Readonly<{ campaignId: string; userId: string }> | Readonly<{ joinCode: string }>;

function describeLookup(lookup: CampaignLookup): string {
  if ('joinCode' in lookup) return `no campaign has join code ${lookup.joinCode}`;
  return `campaign ${lookup.campaignId} has no member ${lookup.userId}`;
}

// Same code for "does not exist" and "not a member": telling them apart leaks which ids exist.
export class CampaignNotFoundError extends CampaignError {
  constructor(readonly lookup: CampaignLookup) {
    super('CAMPAIGN_NOT_FOUND', describeLookup(lookup));
  }
}

export class CampaignPasswordRequiredError extends CampaignError {
  constructor(readonly campaignId: string) {
    super(
      'CAMPAIGN_PASSWORD_REQUIRED',
      `campaign ${campaignId} asks for a password; none was sent`,
    );
  }
}

export class CampaignPasswordInvalidError extends CampaignError {
  constructor(readonly campaignId: string) {
    super(
      'CAMPAIGN_PASSWORD_INVALID',
      `the password sent for campaign ${campaignId} does not match`,
    );
  }
}

export class CampaignCodeExhaustedError extends CampaignError {
  constructor(readonly attempts: readonly string[]) {
    super(
      'CAMPAIGN_CODE_EXHAUSTED',
      `every generated join code collided after ${attempts.length} attempts: ${attempts.join(', ')}`,
    );
  }
}

export class CampaignJoinRateLimitedError extends CampaignError {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED', `too many join attempts; retry after ${retryAfterSeconds} s`);
  }
}

export class InvalidCampaignIdError extends CampaignError {
  constructor(readonly received: unknown) {
    super('INVALID_PARAMS', `the campaign id must be a uuid; received ${String(received)}`);
  }
}

// A member asking for something their role at the table does not allow (spec §3.9).
export class ForbiddenActionError extends CampaignError {
  constructor(
    readonly campaignId: string,
    readonly userId: string,
    readonly action: string,
    readonly required: string,
  ) {
    super(
      'FORBIDDEN',
      `user ${userId} may not ${action} in campaign ${campaignId}: requires ${required}`,
    );
  }
}
