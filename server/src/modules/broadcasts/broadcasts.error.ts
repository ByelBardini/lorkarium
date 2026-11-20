export type BroadcastsErrorCode =
  | 'BROADCAST_NOT_FOUND'
  | 'ALREADY_CONFIRMED'
  | 'TEST_REQUIRED'
  | 'TWO_FACTOR_REQUIRED'
  | 'CONFIRMATION_MISMATCH'
  | 'MAIL_DELIVERY_FAILED'
  | 'RATE_LIMITED';

/** Every refusal of the backoffice notices; the edge turns `code` into the HTTP status. */
export class BroadcastsError extends Error {
  constructor(
    readonly code: BroadcastsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BroadcastsError';
  }
}

export class BroadcastsRateLimitedError extends BroadcastsError {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED', `too many test sends; retry in ${retryAfterSeconds} s`);
  }
}
