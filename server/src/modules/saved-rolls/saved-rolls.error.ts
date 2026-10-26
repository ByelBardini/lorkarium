export type SavedRollsErrorCode =
  'SAVED_ROLL_NOT_FOUND' | 'SAVED_ROLL_NAME_TAKEN' | 'SAVED_ROLLS_LIMIT' | 'RATE_LIMITED';

/** Every refusal of the saved rolls of their own; the edge turns `code` into the HTTP status. */
export class SavedRollsError extends Error {
  constructor(
    readonly code: SavedRollsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SavedRollsError';
  }
}

// Also for a roll of someone else or of another table: telling them apart leaks which ids exist.
export class SavedRollNotFoundError extends SavedRollsError {
  constructor(
    readonly campaignId: string,
    readonly userId: string,
    readonly savedRollId: string,
  ) {
    super(
      'SAVED_ROLL_NOT_FOUND',
      `user ${userId} keeps no saved roll ${savedRollId} at campaign ${campaignId}`,
    );
  }
}

export class SavedRollNameTakenError extends SavedRollsError {
  constructor(readonly savedRollName: string) {
    super(
      'SAVED_ROLL_NAME_TAKEN',
      `a saved roll named "${savedRollName}" already exists; expected a name unique per member, ignoring case and accents`,
    );
  }
}

export class SavedRollsLimitError extends SavedRollsError {
  constructor(
    readonly wanted: number,
    readonly limit: number,
  ) {
    super(
      'SAVED_ROLLS_LIMIT',
      `saving would keep ${wanted} of ${limit} saved rolls; expected at most ${limit} per member`,
    );
  }
}

export class SavedRollsRateLimitedError extends SavedRollsError {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED', `too many saved roll changes; retry after ${retryAfterSeconds} s`);
  }
}
