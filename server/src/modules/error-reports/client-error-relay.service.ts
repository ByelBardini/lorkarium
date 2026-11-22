import type { ClientErrorEnvelopeBo, ClientErrorSender } from './client-error-envelope.bo';
import { clientErrorEnvelopeOf, envelopeTextOf } from './client-error-envelope.mapper';
import type { ClientErrorRelay } from './client-error-relay.port';
import type { ReportFailureLog } from './unexpected-errors.service';

/** What the tunnel did with one browser envelope. */
export type ClientErrorRelayOutcome = 'forwarded' | 'nothing-to-forward' | 'relay-failed';

export type ClientErrorRelayDeps = Readonly<{
  relay: ClientErrorRelay;
  envelope: ClientErrorEnvelopeBo;
  log: ReportFailureLog;
}>;

/** The tunnel's use case: read, filter and stamp the envelope, then forward it once. A failed
 *  forward is a `warn`: a Sentry outage must never become a report about itself.
 *
 *  Example: `await service.relay(body, { id: user.id, username: user.username }) // 'forwarded'` */
export class ClientErrorRelayService {
  constructor(private readonly deps: ClientErrorRelayDeps) {}

  /** Throws `ErrorReportError` for a body that is not an envelope or not ours. */
  async relay(text: string, sender: ClientErrorSender | null): Promise<ClientErrorRelayOutcome> {
    const forwardable = this.deps.envelope.forwardable(clientErrorEnvelopeOf(text), sender);
    if (!forwardable) return 'nothing-to-forward';
    try {
      await this.deps.relay.forward(envelopeTextOf(forwardable));
      return 'forwarded';
    } catch (error) {
      this.deps.log.warn({ err: error }, 'browser error report not forwarded to Sentry');
      return 'relay-failed';
    }
  }
}
