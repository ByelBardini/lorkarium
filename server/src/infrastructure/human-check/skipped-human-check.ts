import type { HumanCheckPort } from '../../modules/account-links/human-check.port';

/** The check of a server without the Turnstile keys (only outside production): every token
 *  passes, so dev and the integration specs need no Cloudflare.
 *
 *  Example: `await new SkippedHumanCheck().verify('', '127.0.0.1') // true` */
export class SkippedHumanCheck implements HumanCheckPort {
  async verify(): Promise<boolean> {
    return true;
  }
}
