import { createVerify, generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { GitHubAppIssueTracker } from '../../../src/infrastructure/github/github-app-issue-tracker';
import { UnconfiguredIssueTracker } from '../../../src/infrastructure/github/unconfigured-issue-tracker';
import { IssueTrackerNotConfiguredError } from '../../../src/modules/feedback/feedback.error';
import { ClockFake } from '../../support/auth-fakes';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
const CONFIG = {
  appId: '123456',
  installationId: '7890',
  privateKey: PEM,
  owner: 'ByelBardini',
  repository: 'lorkarium',
};
const NOW = new Date('2026-11-19T12:00:00Z');
const ISSUE = { title: '[bug] Token volta', body: 'Corpo', labels: ['bug', 'via-app'] };
const TOKEN_URL = 'https://api.github.com/app/installations/7890/access_tokens';
const ISSUES_URL = 'https://api.github.com/repos/ByelBardini/lorkarium/issues';

type Sent = Readonly<{ url: string; init: RequestInit }>;

/** Answers GitHub's two calls from a script; keeps every request it got. */
class GitHubHttpFake {
  readonly sent: Sent[] = [];
  tokenExpiresAt = '2026-11-19T13:00:00Z';
  issueStatus = 201;
  issueBody: unknown = {
    html_url: 'https://github.com/ByelBardini/lorkarium/issues/42',
    number: 42,
  };
  failure: Error | null = null;

  readonly fetch = async (url: string, init: RequestInit): Promise<Response> => {
    this.sent.push({ url, init });
    if (this.failure) throw this.failure;
    if (url === TOKEN_URL) {
      return Response.json(
        { token: `ghs_${this.sent.length}`, expires_at: this.tokenExpiresAt },
        { status: 201 },
      );
    }
    return Response.json(this.issueBody, { status: this.issueStatus });
  };

  headerOf(index: number, name: string): string | undefined {
    return (this.sent[index]?.init.headers as Record<string, string> | undefined)?.[name];
  }
}

function claimsOf(jwt: string): Record<string, unknown> {
  const [header = '', claims = '', signature = ''] = jwt.split('.');
  const verifier = createVerify('RSA-SHA256').update(`${header}.${claims}`);
  expect(verifier.verify(publicKey, signature, 'base64url')).toBe(true);
  expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
    alg: 'RS256',
    typ: 'JWT',
  });
  return JSON.parse(Buffer.from(claims, 'base64url').toString()) as Record<string, unknown>;
}

let http: GitHubHttpFake;
let clock: ClockFake;
let tracker: GitHubAppIssueTracker;

beforeEach(() => {
  http = new GitHubHttpFake();
  clock = new ClockFake(NOW);
  tracker = new GitHubAppIssueTracker({ config: CONFIG, fetch: http.fetch, clock });
});

describe('GitHubAppIssueTracker', () => {
  it('trades a signed App JWT for a token, then opens the issue with it', async () => {
    const created = await tracker.create(ISSUE);

    expect(created).toEqual({
      url: 'https://github.com/ByelBardini/lorkarium/issues/42',
      number: 42,
    });
    expect(http.sent.map((sent) => sent.url)).toEqual([TOKEN_URL, ISSUES_URL]);
    const jwt = http.headerOf(0, 'authorization')?.replace('Bearer ', '') ?? '';
    const issuedAt = NOW.getTime() / 1000 - 60;
    expect(claimsOf(jwt)).toEqual({ iat: issuedAt, exp: issuedAt + 540, iss: '123456' });
    expect(http.headerOf(1, 'authorization')).toBe('Bearer ghs_1');
    expect(http.headerOf(1, 'accept')).toBe('application/vnd.github+json');
    expect(http.headerOf(1, 'x-github-api-version')).toBe('2022-11-28');
    expect(JSON.parse(String(http.sent[1]?.init.body))).toEqual(ISSUE);
  });

  it('a second issue within the token life reuses it; one 5 minutes from the end renews it', async () => {
    await tracker.create(ISSUE);
    clock.current = new Date('2026-11-19T12:54:59Z');
    await tracker.create(ISSUE);
    expect(http.sent.filter((sent) => sent.url === TOKEN_URL)).toHaveLength(1);

    clock.current = new Date('2026-11-19T12:55:00Z');
    await tracker.create(ISSUE);
    expect(http.sent.filter((sent) => sent.url === TOKEN_URL)).toHaveLength(2);
  });

  it.each([401, 403, 422, 502])(
    'GitHub answering %i is unavailable citing the status, never the token',
    async (status) => {
      http.issueStatus = status;

      const failure = await tracker.create(ISSUE).catch((error: unknown) => error);

      expect(failure).toMatchObject({
        name: 'IssueTrackerUnavailableError',
        message: `issue tracker unavailable: GitHub answered ${status} to create the issue`,
      });
      expect(String((failure as Error).message)).not.toContain('ghs_');
    },
  );

  it('an answer without the issue link is unavailable', async () => {
    http.issueBody = { number: 42 };

    await expect(tracker.create(ISSUE)).rejects.toMatchObject({
      name: 'IssueTrackerUnavailableError',
    });
  });

  it('GitHub not answering at all is unavailable, with the cause kept', async () => {
    http.failure = new Error('ECONNRESET');

    await expect(tracker.create(ISSUE)).rejects.toMatchObject({
      name: 'IssueTrackerUnavailableError',
      cause: http.failure,
    });
  });
});

describe('UnconfiguredIssueTracker', () => {
  it('refuses every issue as not configured', async () => {
    await expect(new UnconfiguredIssueTracker().create()).rejects.toBeInstanceOf(
      IssueTrackerNotConfiguredError,
    );
  });
});
