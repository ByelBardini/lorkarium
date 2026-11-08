import { SAVED_COLORS_LIMIT_CODE } from '@lorkarium/contracts';

export type SavedColorsErrorCode = typeof SAVED_COLORS_LIMIT_CODE | 'RATE_LIMITED';

/** Every refusal of the saved colors of their own; the edge turns `code` into the HTTP status. */
export class SavedColorsError extends Error {
  constructor(
    readonly code: SavedColorsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SavedColorsError';
  }
}

export class SavedColorsLimitError extends SavedColorsError {
  constructor(
    readonly keptCount: number,
    readonly limit: number,
  ) {
    super(
      SAVED_COLORS_LIMIT_CODE,
      `the account keeps ${keptCount} saved colors: expected at most ${limit}, delete one first`,
    );
  }
}

export class SavedColorsRateLimitedError extends SavedColorsError {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED', `too many saved color changes; retry in ${retryAfterSeconds} s`);
  }
}
