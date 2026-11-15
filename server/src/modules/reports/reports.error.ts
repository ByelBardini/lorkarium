export type ReportsErrorCode =
  | 'REPORT_SELF'
  | 'REPORT_TARGET_NOT_FOUND'
  | 'REPORT_ALREADY_OPEN'
  | 'REPORT_NOT_FOUND'
  | 'REPORT_FORBIDDEN'
  | 'RATE_LIMITED';

/** Every refusal of the reports; the edge turns `code` into the HTTP status. */
export class ReportsError extends Error {
  constructor(
    readonly code: ReportsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ReportsError';
  }
}

export class ReportsRateLimitedError extends ReportsError {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED', `too many reports; retry in ${retryAfterSeconds} s`);
  }
}
