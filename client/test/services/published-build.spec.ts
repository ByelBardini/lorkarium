import { describe, expect, it } from 'vitest';
import { FetchPublishedBuild, type FetchPage } from '@/services/published-build';

const PUBLISHED_HTML = `<!doctype html><html><head>
  <script type="module" crossorigin src="/assets/index-Dq9.js"></script>
  <link rel="stylesheet" crossorigin href="/assets/index-B1x.css">
</head><body><div id="root"></div></body></html>`;

/** The server's `GET /`, answering a fixed response (or failing like the network) and keeping
 *  what each request asked. */
class PageServerFake {
  readonly requests: Array<Readonly<{ url: string; init: RequestInit }>> = [];

  constructor(private readonly answer: () => Response) {}

  readonly fetchPage: FetchPage = (url, init) => {
    this.requests.push({ url, init });
    return Promise.resolve().then(this.answer);
  };
}

describe('FetchPublishedBuild', () => {
  it('reads the fingerprint of the index.html the server publishes', async () => {
    const server = new PageServerFake(() => new Response(PUBLISHED_HTML, { status: 200 }));
    const fingerprint = await new FetchPublishedBuild(server.fetchPage).fingerprint();
    expect(fingerprint).toBe('/assets/index-B1x.css /assets/index-Dq9.js');
  });

  it('asks / past the browser cache, with the session cookie', async () => {
    const server = new PageServerFake(() => new Response(PUBLISHED_HTML, { status: 200 }));
    await new FetchPublishedBuild(server.fetchPage).fingerprint();
    expect(server.requests).toEqual([
      { url: '/', init: { cache: 'no-store', credentials: 'same-origin' } },
    ]);
  });

  it('answers null when the server answers an error (the deploy in the middle)', async () => {
    const server = new PageServerFake(() => new Response('Bad Gateway', { status: 502 }));
    expect(await new FetchPublishedBuild(server.fetchPage).fingerprint()).toBeNull();
  });

  it('answers null when the network fails', async () => {
    const server = new PageServerFake(() => {
      throw new TypeError('Failed to fetch');
    });
    expect(await new FetchPublishedBuild(server.fetchPage).fingerprint()).toBeNull();
  });
});
