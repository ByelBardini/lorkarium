export type BoardErrorCode = 'RATE_LIMITED' | 'STALE_UNDO';

/** Every board refusal that belongs to no single module (the command rate, a stale undo). */
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

/** An undo whose precondition no longer holds: someone changed the element after the action
 *  being undone, so applying the inverse would overwrite their change. */
export class StaleUndoError extends BoardError {
  constructor(
    readonly target: string,
    readonly expected: string,
    readonly actual: string,
  ) {
    super('STALE_UNDO', `${target} is at ${actual}; the undo expected ${expected}`);
  }
}
