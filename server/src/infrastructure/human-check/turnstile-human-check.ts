import { z } from 'zod';
import type { HumanCheckPort } from '../../modules/account-links/human-check.port';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
// A form waiting longer than this on Cloudflare is worse than a refusal the person can retry.
export const SITEVERIFY_TIMEOUT_MS = 5000;

const siteverifyResponse = z.object({
  success: z.boolean(),
  'error-codes': z.array(z.string()).optional(),
});

/** The one call this adapter makes: `fetch`'s shape, passed in so a spec answers for Cloudflare. */
export type SiteverifyFetch = (url: string, init: RequestInit) => Promise<Response>;

/** Why a token did not pass; never carries the token nor the secret. */
export type HumanCheckFailure =
  | Readonly<{ reason: 'refused'; errorCodes: readonly string[] }>
  | Readonly<{ reason: 'status'; status: number }>
  | Readonly<{ reason: 'unreadable' }>
  | Readonly<{ reason: 'unreachable'; error: string }>;

export type TurnstileHumanCheckDeps = Readonly<{
  secretKey: string;
  fetch: SiteverifyFetch;
  /** Told of every token that did not pass (the server logs it). */
  report: (failure: HumanCheckFailure) => void;
}>;

/** Checks a Turnstile token on Cloudflare's Siteverify. Anything but a readable `success: true`
 *  is a refusal: an outage closes the forms instead of opening them to bots.
 *
 *  Example: `await new TurnstileHumanCheck({ secretKey, fetch, report }).verify(token, request.ip)` */
export class TurnstileHumanCheck implements HumanCheckPort {
  constructor(private readonly deps: TurnstileHumanCheckDeps) {}

  async verify(token: string, remoteIp: string): Promise<boolean> {
    const response = await this.post({
      secret: this.deps.secretKey,
      response: token,
      remoteip: remoteIp,
    });
    if (!response) return false;
    if (!response.ok) return this.fail({ reason: 'status', status: response.status });
    const parsed = siteverifyResponse.safeParse(await response.json().catch(() => null));
    if (!parsed.success) return this.fail({ reason: 'unreadable' });
    if (parsed.data.success) return true;
    return this.fail({ reason: 'refused', errorCodes: parsed.data['error-codes'] ?? [] });
  }

  private async post(payload: object): Promise<Response | null> {
    try {
      return await this.deps.fetch(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : String(error);
      this.deps.report({ reason: 'unreachable', error: name });
      return null;
    }
  }

  private fail(failure: HumanCheckFailure): false {
    this.deps.report(failure);
    return false;
  }
}
