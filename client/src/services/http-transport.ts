export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** How a file goes up: `POST` adds (a table asset), `PUT` replaces (the account photo). */
export type UploadMethod = 'POST' | 'PUT';

/** `body` is the parsed JSON, `null` when empty, `undefined` when the answer is not JSON. */
export type HttpResponse = Readonly<{
  status: number;
  body: unknown;
  header: (name: string) => string | null;
}>;

/** The only door from the client to the HTTP API; services depend on this, tests on a fake.
 *
 *  Example: `await transport.request('POST', '/auth/login', credentials)` */
export interface HttpTransport {
  request(method: HttpMethod, path: string, body?: unknown): Promise<HttpResponse>;
  /** Sends `file` as the raw body with its own `Content-Type` (an image upload); `POST` by default. */
  upload(path: string, file: Blob, method?: UploadMethod): Promise<HttpResponse>;
}

export class NetworkUnavailableError extends Error {
  constructor(
    readonly path: string,
    readonly reason: unknown,
  ) {
    super(`the server could not be reached for ${path}`);
    this.name = 'NetworkUnavailableError';
  }
}

// Same origin in production and through the Vite proxy in dev: the session cookie is first-party.
const API_BASE = '/api';

/** `HttpTransport` over `fetch`, JSON in and out, carrying the session cookie.
 *
 *  Example: `new HttpAuthApi(new FetchHttpTransport())` */
export class FetchHttpTransport implements HttpTransport {
  constructor(private readonly fetchImpl: typeof fetch = (...args) => fetch(...args)) {}

  async request(method: HttpMethod, path: string, body?: unknown): Promise<HttpResponse> {
    return responseOf(await this.send(path, requestInit(method, body)));
  }

  async upload(path: string, file: Blob, method: UploadMethod = 'POST'): Promise<HttpResponse> {
    const init: RequestInit = {
      method,
      credentials: 'same-origin',
      headers: { accept: 'application/json', 'content-type': file.type },
      body: file,
    };
    return responseOf(await this.send(path, init));
  }

  private async send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(`${API_BASE}${path}`, init);
    } catch (reason) {
      throw new NetworkUnavailableError(path, reason);
    }
  }
}

async function responseOf(response: Response): Promise<HttpResponse> {
  return {
    status: response.status,
    body: await readJson(response),
    header: (name) => response.headers.get(name),
  };
}

function requestInit(method: HttpMethod, body: unknown): RequestInit {
  const init: RequestInit = {
    method,
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  };
  if (body === undefined) return init;
  return {
    ...init,
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
