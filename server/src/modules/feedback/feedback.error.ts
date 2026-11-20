export type FeedbackErrorCode =
  | 'FEEDBACK_FORBIDDEN'
  | 'FEEDBACK_OPEN_LIMIT'
  | 'FEEDBACK_NOT_FOUND'
  | 'ATTACHMENT_NOT_FOUND'
  | 'ATTACHMENT_TOO_LARGE'
  | 'UNSUPPORTED_IMAGE'
  | 'ISSUE_TRACKER_UNAVAILABLE'
  | 'ISSUE_TRACKER_NOT_CONFIGURED'
  | 'RATE_LIMITED';

/** Every refusal of the feedback; the edge turns `code` into the HTTP status. */
export class FeedbackError extends Error {
  constructor(
    readonly code: FeedbackErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FeedbackError';
  }
}

export class FeedbackRateLimitedError extends FeedbackError {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED', `too many feedback requests; retry in ${retryAfterSeconds} s`);
  }
}

/** A screenshot body with another `Content-Type` (415, before any decoding). */
export class FeedbackAttachmentMediaTypeError extends FeedbackError {
  constructor(contentType: string) {
    super(
      'UNSUPPORTED_IMAGE',
      `screenshot sent as ${contentType}: expected image/png, image/jpeg or image/webp`,
    );
  }
}

/** Example: `new FeedbackAttachmentTooLargeError(5242880, 6000000)` */
export class FeedbackAttachmentTooLargeError extends FeedbackError {
  constructor(maxBytes: number, sizeBytes: number | null) {
    const size = sizeBytes === null ? 'a body' : `${sizeBytes} bytes`;
    super('ATTACHMENT_TOO_LARGE', `screenshot of ${size}: expected at most ${maxBytes} bytes`);
  }
}

/** The tracker did not answer, refused the credentials or answered something unreadable. */
export class IssueTrackerUnavailableError extends Error {
  constructor(detail: string, options?: ErrorOptions) {
    super(`issue tracker unavailable: ${detail}`, options);
    this.name = 'IssueTrackerUnavailableError';
  }
}

/** The server runs without the tracker's credentials (dev, e2e, or not set up yet). */
export class IssueTrackerNotConfiguredError extends Error {
  constructor() {
    super(
      'issue tracker not configured: expected GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID and GITHUB_APP_PRIVATE_KEY',
    );
    this.name = 'IssueTrackerNotConfiguredError';
  }
}
