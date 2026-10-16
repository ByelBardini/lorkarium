export type BoardErrorCode = 'RATE_LIMITED';

/** Every board refusal that belongs to no single module (the command rate). */
export class BoardError extends Error {
  constructor(
    readonly code: BoardErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BoardError';
  }
}

export class CommandRateLimitedError extends BoardError {
  constructor(
    readonly socketId: string,
    readonly retryAfterSeconds: number,
  ) {
    super(
      'RATE_LIMITED',
      `socket ${socketId} sent more than the command limit; retry after ${retryAfterSeconds} s`,
    );
  }
}
