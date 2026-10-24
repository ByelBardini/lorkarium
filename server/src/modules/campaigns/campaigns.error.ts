export type CampaignErrorCode =
  | 'CAMPAIGN_NOT_FOUND'
  | 'CAMPAIGN_PASSWORD_REQUIRED'
  | 'CAMPAIGN_PASSWORD_INVALID'
  | 'CAMPAIGN_CODE_EXHAUSTED'
  | 'RATE_LIMITED'
  | 'INVALID_PARAMS'
  | 'FORBIDDEN'
  | 'CAMPAIGN_NOT_OPEN'
  | 'INVALID_BODY'
  | 'MEMBER_NOT_FOUND';

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

export class InvalidMemberParamsError extends CampaignError {
  constructor(readonly received: unknown) {
    super(
      'INVALID_PARAMS',
      `the campaign id and the member id must be uuids; received ${String(received)}`,
    );
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

// The cover image must be an asset of this very table sent as a cover (critério 14).
export class InvalidCampaignCoverError extends CampaignError {
  constructor(
    readonly campaignId: string,
    readonly assetId: string,
    readonly purpose: string | null,
  ) {
    const found = purpose === null ? 'no asset of this campaign' : `an asset of purpose ${purpose}`;
    super(
      'INVALID_BODY',
      `cover asset ${assetId} of campaign ${campaignId} must be an asset of that campaign with purpose cover; found ${found}`,
    );
  }
}

// The settings change the live table under everyone at it, so the master must be at it too.
export class CampaignNotOpenError extends CampaignError {
  constructor(
    readonly campaignId: string,
    readonly userId: string,
    readonly action: string,
  ) {
    super(
      'CAMPAIGN_NOT_OPEN',
      `user ${userId} may not ${action} in campaign ${campaignId}: requires the table open in a live connection; found none`,
    );
  }
}

// A member of the table is asked for by id (a card, a role): an id outside it has none.
export class MemberNotFoundError extends CampaignError {
  constructor(
    readonly campaignId: string,
    readonly memberId: string,
  ) {
    super(
      'MEMBER_NOT_FOUND',
      `campaign ${campaignId} has no member ${memberId}; expected the id of a member of the table`,
    );
  }
}

// The master's role is not one the master hands out or takes: nobody becomes nor stops being it.
export class MasterRoleLockedError extends CampaignError {
  constructor(
    readonly campaignId: string,
    readonly userId: string,
    readonly targetId: string,
  ) {
    super(
      'FORBIDDEN',
      `user ${userId} may not change the role of ${targetId} in campaign ${campaignId}: the master's role does not change`,
    );
  }
}
