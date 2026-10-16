export type SessionErrorCode = 'UNAUTHENTICATED' | 'TOO_MANY_TABLES';

/** Every live session refusal of its own; the gateway turns `code` into the ack error. */
export class SessionError extends Error {
  constructor(
    readonly code: SessionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

// The cookie of the handshake no longer resolves: logout or expiry after the connection opened.
export class SessionEndedError extends SessionError {
  constructor(readonly socketId: string) {
    super(
      'UNAUTHENTICATED',
      `the session behind socket ${socketId} ended; a valid session is required`,
    );
  }
}

export class TooManyTablesError extends SessionError {
  constructor(
    readonly campaignId: string,
    readonly limit: number,
  ) {
    super(
      'TOO_MANY_TABLES',
      `cannot open table ${campaignId}: the connection already has ${limit} of ${limit} tables open`,
    );
  }
}
