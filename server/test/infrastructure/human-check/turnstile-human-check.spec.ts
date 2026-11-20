import { beforeEach, describe, expect, it } from 'vitest';
import { SkippedHumanCheck } from '../../../src/infrastructure/human-check/skipped-human-check';
import {
  TurnstileHumanCheck,
  type HumanCheckFailure,
} from '../../../src/infrastructure/human-check/turnstile-human-check';
import type { HumanCheckPort } from '../../../src/modules/account-links/human-check.port';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const SECRET = '1x0000000000000000000000000000000AA';

type Sent = Readonly<{ url: string; init: RequestInit }>;

/** Answers the Siteverify call from a script; keeps every request it got. */
class SiteverifyHttpFake {
  readonly sent: Sent[] = [];
  status = 200;
  body: unknown = { success: true, 'error-codes': [] };
  failure: Error | null = null;

  readonly fetch = async (url: string, init: RequestInit): Promise<Response> => {
    this.sent.push({ url, init });
    if (this.failure) throw this.failure;
    return Response.json(this.body, { status: this.status });
  };

  bodyOf(index: number): unknown {
    return JSON.parse(String(this.sent[index]?.init.body));
  }
}

/** Keeps each failure the adapter reports. */
class HumanCheckFailureLogFake {
  readonly failures: HumanCheckFailure[] = [];
  readonly report = (failure: HumanCheckFailure): void => {
    this.failures.push(failure);
  };
}

describe('TurnstileHumanCheck', () => {
  let http: SiteverifyHttpFake;
  let log: HumanCheckFailureLogFake;
  let check: TurnstileHumanCheck;

  beforeEach(() => {
    http = new SiteverifyHttpFake();
    log = new HumanCheckFailureLogFake();
    check = new TurnstileHumanCheck({ secretKey: SECRET, fetch: http.fetch, report: log.report });
  });

  it('a token Siteverify accepts passes, sending the secret, the token and the IP', async () => {
    expect(await check.verify('tok-123', '203.0.113.7')).toBe(true);
    expect(http.sent[0]?.url).toBe(SITEVERIFY_URL);
    expect(http.sent[0]?.init.method).toBe('POST');
    expect(http.bodyOf(0)).toEqual({
      secret: SECRET,
      response: 'tok-123',
      remoteip: '203.0.113.7',
    });
    expect(log.failures).toEqual([]);
  });

  it('the request carries a timeout signal', async () => {
    await check.verify('tok-123', '203.0.113.7');
    expect(http.sent[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('a token Siteverify refuses fails, reporting its error codes', async () => {
    http.body = { success: false, 'error-codes': ['timeout-or-duplicate'] };
    expect(await check.verify('tok-old', '203.0.113.7')).toBe(false);
    expect(log.failures).toEqual([{ reason: 'refused', errorCodes: ['timeout-or-duplicate'] }]);
  });

  it('a 5xx answer fails closed, reporting the status', async () => {
    http.status = 503;
    http.body = { success: true };
    expect(await check.verify('tok-123', '203.0.113.7')).toBe(false);
    expect(log.failures).toEqual([{ reason: 'status', status: 503 }]);
  });

  it('a body out of the Siteverify shape fails closed', async () => {
    http.body = { ok: 'yes' };
    expect(await check.verify('tok-123', '203.0.113.7')).toBe(false);
    expect(log.failures).toEqual([{ reason: 'unreadable' }]);
  });

  it('a timed-out request fails closed, reporting the error name', async () => {
    http.failure = new DOMException('The operation timed out.', 'TimeoutError');
    expect(await check.verify('tok-123', '203.0.113.7')).toBe(false);
    expect(log.failures).toEqual([{ reason: 'unreachable', error: 'TimeoutError' }]);
  });
});

describe('SkippedHumanCheck', () => {
  it.each(['', 'anything'])('passes the token "%s" without asking anyone', async (token) => {
    const check: HumanCheckPort = new SkippedHumanCheck();
    expect(await check.verify(token, '203.0.113.7')).toBe(true);
  });
});
