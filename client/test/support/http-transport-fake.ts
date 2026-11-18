import {
  NetworkUnavailableError,
  type HttpMethod,
  type HttpResponse,
  type HttpTransport,
  type RequestHeaders,
  type UploadMethod,
} from '@/services/http-transport';

export type RecordedRequest = Readonly<{
  method: HttpMethod;
  path: string;
  body: unknown;
  headers?: RequestHeaders;
}>;

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

  async upload(path: string, file: Blob, method: UploadMethod = 'POST'): Promise<HttpResponse> {
    return this.request(method, path, file);
  }

  async request(
    method: HttpMethod,
    path: string,
    body?: unknown,
    headers?: RequestHeaders,
  ): Promise<HttpResponse> {
    this.requests.push(
      headers === undefined ? { method, path, body } : { method, path, body, headers },
    );
    const next = this.queue.shift();
    if (next === undefined) throw new Error(`no response queued for ${method} ${path}`);
    if (next === 'network-down')
      throw new NetworkUnavailableError(path, new TypeError('Failed to fetch'));
    return next;
  }
}
