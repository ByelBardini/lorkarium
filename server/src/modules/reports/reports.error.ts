export type ReportsErrorCode =
  | 'REPORT_SELF'
  | 'REPORT_TARGET_NOT_FOUND'
  | 'REPORT_ALREADY_OPEN'
  | 'REPORT_NOT_FOUND'
  | 'REPORT_FORBIDDEN'
  | 'CAMPAIGN_NOT_SHARED'
  | 'ATTACHMENT_NOT_FOUND'
  | 'ATTACHMENT_TOO_LARGE'
  | 'UNSUPPORTED_IMAGE'
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

/** A screenshot body with another `Content-Type` (415, before any decoding). */
export class ReportAttachmentMediaTypeError extends ReportsError {
  constructor(contentType: string) {
    super(
      'UNSUPPORTED_IMAGE',
      `screenshot sent as ${contentType}: expected image/png, image/jpeg or image/webp`,
    );
  }
}

/** Example: `new ReportAttachmentTooLargeError(5242880, 6000000)` */
export class ReportAttachmentTooLargeError extends ReportsError {
  constructor(maxBytes: number, sizeBytes: number | null) {
    const size = sizeBytes === null ? 'a body' : `${sizeBytes} bytes`;
    super('ATTACHMENT_TOO_LARGE', `screenshot of ${size}: expected at most ${maxBytes} bytes`);
  }
}
