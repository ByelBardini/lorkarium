export interface HttpJsonResponse {
  status: number;
  body: unknown;
}

/** Port for a JSON GET; rejects on network failure or when the deadline passes. */
export interface HttpGet {
  getJson(url: string, timeoutMs: number): Promise<HttpJsonResponse>;
}

type FetchFunction = (input: string, init: RequestInit) => Promise<Response>;

/** `HttpGet` over the browser `fetch`, aborted by an `AbortController` at the deadline. */
export class FetchHttpGet implements HttpGet {
  constructor(
    private readonly fetchFunction: FetchFunction = (input, init) => fetch(input, init),
  ) {}

  /**
   * GETs the URL as GitHub JSON; a body that is not JSON comes back as `null`.
   * Example: `await new FetchHttpGet().getJson(LATEST_RELEASE_API_URL, 5_000) // { status: 200, body: {…} }`
   */
  async getJson(url: string, timeoutMs: number): Promise<HttpJsonResponse> {
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        controller.abort(
          new DOMException(`no answer from ${url} in ${timeoutMs} ms`, 'TimeoutError'),
        ),
      timeoutMs,
    );
    try {
      const response = await this.fetchFunction(url, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: controller.signal,
      });
      return { status: response.status, body: await jsonOrNull(response) };
    } finally {
      clearTimeout(timer);
    }
  }
}

async function jsonOrNull(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
