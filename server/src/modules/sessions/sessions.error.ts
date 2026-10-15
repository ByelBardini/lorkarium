export type SessionErrorCode = 'UNAUTHENTICATED';

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
