export type ConditionErrorCode = 'CONDITION_NOT_FOUND';

/** Every condition refusal of its own; the gateway turns `code` into the ack error. */
export class ConditionError extends Error {
  constructor(
    readonly code: ConditionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ConditionError';
  }
}

// Also for a condition of another table: telling them apart leaks which ids exist (§2.6).
export class ConditionNotFoundError extends ConditionError {
  constructor(
    readonly campaignId: string,
    readonly conditionId: string,
  ) {
    super('CONDITION_NOT_FOUND', `campaign ${campaignId} has no condition ${conditionId} here`);
  }
}
