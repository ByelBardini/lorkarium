export type MemberCardErrorCode = 'MEMBER_NOT_FOUND';

/** Every member card refusal of its own; the gateway turns `code` into the ack error. */
export class MemberCardError extends Error {
  constructor(
    readonly code: MemberCardErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MemberCardError';
  }
}

// The card is of a member: an id outside the table has none to edit.
export class MemberNotFoundError extends MemberCardError {
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
