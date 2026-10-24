export type ConditionErrorCode = 'CONDITION_NOT_FOUND' | 'CONDITION_NAME_TAKEN' | 'INVALID_STACKS';

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

// The unique index ignores case: "cego" is taken by "Cego". Renaming into its own name is not.
export class ConditionNameTakenError extends ConditionError {
  constructor(
    readonly campaignId: string,
    readonly conditionName: string,
    readonly takenBy: string,
  ) {
    super(
      'CONDITION_NAME_TAKEN',
      `campaign ${campaignId} already has condition ${takenBy} named ${conditionName}; expected a name no other condition of the table has`,
    );
  }
}

// The contract only knows the global 1..99: the definition's own `maxStacks` is checked here.
export class ConditionStacksError extends ConditionError {
  constructor(
    readonly activeConditionId: string,
    readonly stacks: number,
    readonly maxStacks: number,
  ) {
    super(
      'INVALID_STACKS',
      `condition ${activeConditionId} cannot have ${stacks} stacks; expected 1 to ${maxStacks}`,
    );
  }
}
