import { describe, expect, it } from 'vitest';
import { FetchHttpTransport, NetworkUnavailableError } from '@/services/http-transport';

type FetchCall = Readonly<{ url: string; init: RequestInit | undefined }>;

/** A `fetch` that records its calls and answers with a fixed Response (or rejects like a dead network). */
class FetchFake {
  readonly calls: FetchCall[] = [];

  constructor(private readonly answer: Response | 'network-down') {}

  readonly fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    this.calls.push({ url: String(input), init });
    if (this.answer === 'network-down') throw new TypeError('Failed to fetch');
    return this.answer;
  };
}

describe('FetchHttpTransport', () => {
  it('posts JSON under /api with same-origin credentials and parses the JSON answer', async () => {
    const fake = new FetchFake(Response.json({ ok: 1 }, { status: 200 }));
    const response = await new FetchHttpTransport(fake.fetch).request('POST', '/auth/login', {
      a: 1,
    });
    expect(fake.calls).toEqual([
      {
        url: '/api/auth/login',
        init: {
          method: 'POST',
          credentials: 'same-origin',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: '{"a":1}',
        },
      },
    ]);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: 1 });
  });

  it('an upload posts the file itself as the body, with its own content type', async () => {
    const fake = new FetchFake(Response.json({ asset: {} }, { status: 201 }));
    const file = new File([new Uint8Array([1, 2, 3])], 'mapa.webp', { type: 'image/webp' });

    const response = await new FetchHttpTransport(fake.fetch).upload('/campaigns/x/assets', file);

    expect(fake.calls).toEqual([
      {
        url: '/api/campaigns/x/assets',
        init: {
          method: 'POST',
          credentials: 'same-origin',
          headers: { accept: 'application/json', 'content-type': 'image/webp' },
          body: file,
        },
      },
    ]);
    expect(response.status).toBe(201);
  });

  it('a GET carries no body nor content-type', async () => {
    const fake = new FetchFake(Response.json({ user: null }));
    await new FetchHttpTransport(fake.fetch).request('GET', '/auth/me');
    expect(fake.calls[0]?.init).toEqual({
      method: 'GET',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
  });

  it('a PATCH sends its JSON body and a DELETE none, each under its own method', async () => {
    const fake = new FetchFake(new Response(null, { status: 204 }));
    const transport = new FetchHttpTransport(fake.fetch);
    await transport.request('PATCH', '/campaigns/x/scenes/y', { name: 'Torre' });
    await transport.request('DELETE', '/campaigns/x/scenes/y');
    expect(fake.calls.map(({ init }) => [init?.method, init?.body])).toEqual([
      ['PATCH', '{"name":"Torre"}'],
      ['DELETE', undefined],
    ]);
  });

  it('a 204 answer has a null body', async () => {
    const fake = new FetchFake(new Response(null, { status: 204 }));
    const response = await new FetchHttpTransport(fake.fetch).request('POST', '/auth/logout');
    expect(response.body).toBeNull();
  });

  it('a non-JSON answer keeps the status and has an undefined body', async () => {
    const fake = new FetchFake(new Response('<html>bad gateway</html>', { status: 502 }));
    const response = await new FetchHttpTransport(fake.fetch).request('GET', '/auth/me');
    expect(response.status).toBe(502);
    expect(response.body).toBeUndefined();
  });

  it('a rejected fetch becomes NetworkUnavailableError naming the path', async () => {
    const fake = new FetchFake('network-down');
    const request = new FetchHttpTransport(fake.fetch).request('GET', '/auth/me');
    await expect(request).rejects.toBeInstanceOf(NetworkUnavailableError);
    await expect(request).rejects.toMatchObject({
      path: '/auth/me',
      message: expect.stringContaining('/auth/me'),
    });
  });

  it('headers are read case-insensitively', async () => {
    const fake = new FetchFake(Response.json({}, { status: 429, headers: { 'Retry-After': '7' } }));
    const response = await new FetchHttpTransport(fake.fetch).request('POST', '/auth/login', {});
    expect(response.header('retry-after')).toBe('7');
  });
});
