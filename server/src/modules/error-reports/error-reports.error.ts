export type ErrorReportErrorCode = 'INVALID_ENVELOPE' | 'UNKNOWN_DSN' | 'RATE_LIMITED';

/** A refusal of the browser tunnel; the edge turns `code` into 400, 403 or 429. */
export class ErrorReportError extends Error {
  constructor(
    readonly code: ErrorReportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ErrorReportError';
  }
}

export class ErrorReportRateLimitedError extends ErrorReportError {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED', `too many error report requests; retry in ${retryAfterSeconds} s`);
  }
}

/** Thrown on purpose by the backoffice's "Teste de erros": it must reach Sentry as any 5xx does. */
export class ErrorReportTestError extends Error {
  constructor(adminId: string) {
    super(`error report test asked by the admin ${adminId}`);
    this.name = 'ErrorReportTestError';
  }
}
