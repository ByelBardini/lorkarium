/** Told when a login session ends by logout, so whatever kept it in memory (the realtime
 *  connections) lets it go; auth does not know who that is.
 *
 *  Example: `sessionEnded.sessionEnded(tokens.hash(token))` */
export interface SessionEndedPort {
  sessionEnded(sessionId: string): void;
}
