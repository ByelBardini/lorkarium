import type { ClientErrorRelay } from '../../modules/error-reports/client-error-relay.port';

/** The relay without `SENTRY_DSN`: the tunnel answers 204 before reaching it, so this is only the
 *  default a module needs to be built.
 *
 *  Example: `new DiscardedClientErrorRelay().forward(envelope)` */
export class DiscardedClientErrorRelay implements ClientErrorRelay {
  forward(): Promise<void> {
    return Promise.resolve();
  }
}
