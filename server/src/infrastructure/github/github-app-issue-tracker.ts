import { createSign } from 'node:crypto';
import { z } from 'zod';
import type { GitHubAppConfig } from '../../config/github-env';
import type { ClockPort } from '../../modules/auth/clock.port';
import { IssueTrackerUnavailableError } from '../../modules/feedback/feedback.error';
import type {
  CreatedIssue,
  IssueTrackerPort,
  NewIssue,
} from '../../modules/feedback/issue-tracker.port';

const API = 'https://api.github.com';
const API_VERSION = '2022-11-28';
// GitHub refuses an App JWT that lives past 10 minutes; a minute back covers a clock skew.
const JWT_BACKDATE_S = 60;
const JWT_LIFETIME_S = 9 * 60;
// An installation token lives an hour; one this close to the end is renewed before use.
const TOKEN_RENEW_MARGIN_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

const tokenResponse = z.object({ token: z.string().min(1), expires_at: z.iso.datetime() });
const issueResponse = z.object({
  html_url: z.url({ protocol: /^https$/, hostname: /^github\.com$/ }),
  number: z.int().positive(),
});

/** The one call this adapter makes: `fetch`'s shape, passed in so a spec answers for GitHub. */
export type GitHubFetch = (url: string, init: RequestInit) => Promise<Response>;

export type GitHubAppIssueTrackerDeps = Readonly<{
  config: GitHubAppConfig;
  fetch: GitHubFetch;
  clock: ClockPort;
}>;

type InstallationToken = Readonly<{ token: string; renewAt: number }>;

/** Opens issues as the GitHub App (`lorkarium[bot]`): a JWT signed with the App key is traded for
 *  an installation token, kept until 5 minutes before it ends.
 *
 *  Example: `await new GitHubAppIssueTracker({ config, fetch, clock }).create({ title, body, labels })` */
export class GitHubAppIssueTracker implements IssueTrackerPort {
  private cached: InstallationToken | null = null;

  constructor(private readonly deps: GitHubAppIssueTrackerDeps) {}

  async create(issue: NewIssue): Promise<CreatedIssue> {
    const { owner, repository } = this.deps.config;
    const token = await this.installationToken();
    const payload = { title: issue.title, body: issue.body, labels: [...issue.labels] };
    const url = `${API}/repos/${owner}/${repository}/issues`;
    const created = await this.call('create the issue', url, `Bearer ${token}`, payload);
    const parsed = issueResponse.safeParse(created);
    if (parsed.success) return { url: parsed.data.html_url, number: parsed.data.number };
    throw new IssueTrackerUnavailableError(`unreadable issue answer: ${parsed.error.message}`);
  }

  private async installationToken(): Promise<string> {
    const now = this.deps.clock.now().getTime();
    if (this.cached && now < this.cached.renewAt) return this.cached.token;
    const url = `${API}/app/installations/${this.deps.config.installationId}/access_tokens`;
    const answer = await this.call('get a token', url, `Bearer ${this.jwt(now)}`, null);
    const parsed = tokenResponse.safeParse(answer);
    if (!parsed.success) {
      throw new IssueTrackerUnavailableError(`unreadable token answer: ${parsed.error.message}`);
    }
    const renewAt = Date.parse(parsed.data.expires_at) - TOKEN_RENEW_MARGIN_MS;
    this.cached = { token: parsed.data.token, renewAt };
    return parsed.data.token;
  }

  private jwt(nowMs: number): string {
    const issuedAt = Math.floor(nowMs / 1000) - JWT_BACKDATE_S;
    const header = base64UrlJson({ alg: 'RS256', typ: 'JWT' });
    const claims = base64UrlJson({
      iat: issuedAt,
      exp: issuedAt + JWT_LIFETIME_S,
      iss: this.deps.config.appId,
    });
    const signature = createSign('RSA-SHA256')
      .update(`${header}.${claims}`)
      .sign(this.deps.config.privateKey, 'base64url');
    return `${header}.${claims}.${signature}`;
  }

  private async call(
    operation: string,
    url: string,
    authorization: string,
    payload: object | null,
  ): Promise<unknown> {
    const response = await this.send(operation, url, {
      method: 'POST',
      headers: headersOf(authorization),
      ...(payload ? { body: JSON.stringify(payload) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new IssueTrackerUnavailableError(`GitHub answered ${response.status} to ${operation}`);
    }
    return response.json();
  }

  private async send(operation: string, url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.deps.fetch(url, init);
    } catch (error) {
      throw new IssueTrackerUnavailableError(`GitHub did not answer to ${operation}`, {
        cause: error,
      });
    }
  }
}

function headersOf(authorization: string): Record<string, string> {
  return {
    authorization,
    accept: 'application/vnd.github+json',
    'content-type': 'application/json',
    'user-agent': 'lorkarium-server',
    'x-github-api-version': API_VERSION,
  };
}

function base64UrlJson(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
