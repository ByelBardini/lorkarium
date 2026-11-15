export type ReputationErrorCode =
  'REPUTATION_SELF' | 'REPUTATION_NOT_ALLOWED' | 'REPUTATION_TARGET_NOT_FOUND' | 'RATE_LIMITED';

/** Every refusal of the reputation; the edge turns `code` into the HTTP status. */
export class ReputationError extends Error {
  constructor(
    readonly code: ReputationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ReputationError';
  }
}

export class ReputationRateLimitedError extends ReputationError {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED', `too many reputation votes; retry in ${retryAfterSeconds} s`);
  }
}
