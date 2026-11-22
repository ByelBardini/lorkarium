/** Hands a cleaned browser envelope on to Sentry; rejects when Sentry did not take it. */
export interface ClientErrorRelay {
  forward(envelope: string): Promise<void>;
}
