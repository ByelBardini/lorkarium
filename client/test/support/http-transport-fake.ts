import {
  NetworkUnavailableError,
  type HttpMethod,
  type HttpResponse,
  type HttpTransport,
} from '@/services/http-transport';

export type RecordedRequest = Readonly<{ method: HttpMethod; path: string; body: unknown }>;

/** Answers each request with the next queued response; `requests` keeps what was sent. */
export class HttpTransportFake implements HttpTransport {
  readonly requests: RecordedRequest[] = [];
  private readonly queue: Array<HttpResponse | 'network-down'> = [];

  respondWith(status: number, body: unknown, headers: Record<string, string> = {}): this {
    this.queue.push({ status, body, header: (name) => headers[name.toLowerCase()] ?? null });
    return this;
  }

  failWithNetworkDown(): this {
    this.queue.push('network-down');
    return this;
  }

  async upload(path: string, file: Blob): Promise<HttpResponse> {
    return this.request('POST', path, file);
  }

  async request(method: HttpMethod, path: string, body?: unknown): Promise<HttpResponse> {
    this.requests.push({ method, path, body });
    const next = this.queue.shift();
    if (next === undefined) throw new Error(`no response queued for ${method} ${path}`);
    if (next === 'network-down')
      throw new NetworkUnavailableError(path, new TypeError('Failed to fetch'));
    return next;
  }
}
