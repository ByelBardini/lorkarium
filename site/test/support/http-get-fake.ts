import type { HttpGet, HttpJsonResponse } from '@/services/http-get';

export interface HttpGetCall {
  url: string;
  timeoutMs: number;
}

type QueuedReply =
  { kind: 'response'; response: HttpJsonResponse } | { kind: 'failure'; error: Error };

/** Answers `getJson` from a queue of responses or failures and records every call. */
export class HttpGetFake implements HttpGet {
  readonly calls: HttpGetCall[] = [];
  private readonly replies: QueuedReply[] = [];

  respondWith(status: number, body: unknown): this {
    this.replies.push({ kind: 'response', response: { status, body } });
    return this;
  }

  failWith(error: Error): this {
    this.replies.push({ kind: 'failure', error });
    return this;
  }

  async getJson(url: string, timeoutMs: number): Promise<HttpJsonResponse> {
    this.calls.push({ url, timeoutMs });
    const reply = this.replies.shift();
    if (!reply) throw new Error(`HttpGetFake has no queued reply for ${url}`);
    if (reply.kind === 'failure') throw reply.error;
    return reply.response;
  }
}
