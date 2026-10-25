export interface FetchCall {
  url: string;
  headers: Headers;
}

/**
 * Stands in for `fetch`: answers with a fixed `Response`, or, when `hangs`, never answers until aborted.
 * Example: `new FetchHttpGet(new FetchFake(new Response('{}')).fetch)`
 */
export class FetchFake {
  readonly calls: FetchCall[] = [];

  constructor(
    private readonly response: Response | null,
    private readonly hangs = false,
  ) {}

  readonly fetch = (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    this.calls.push({ url: String(input), headers: new Headers(init.headers) });
    if (!this.hangs && this.response) return Promise.resolve(this.response);
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    });
  };
}
