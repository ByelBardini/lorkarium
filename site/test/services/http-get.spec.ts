import { describe, expect, it } from 'vitest';
import { FetchHttpGet } from '@/services/http-get';
import { FetchFake } from '../support/fetch-fake';

const URL_UNDER_TEST = 'https://api.github.com/repos/ByelBardini/lorkarium/releases/latest';

describe('FetchHttpGet', () => {
  it('asks for the GitHub JSON media type', async () => {
    const fake = new FetchFake(Response.json({}));

    await new FetchHttpGet(fake.fetch).getJson(URL_UNDER_TEST, 5_000);

    expect(fake.calls[0]?.headers.get('Accept')).toBe('application/vnd.github+json');
  });

  it('returns the status with the parsed JSON body', async () => {
    const fake = new FetchFake(Response.json({ message: 'Not Found' }, { status: 404 }));

    const response = await new FetchHttpGet(fake.fetch).getJson(URL_UNDER_TEST, 5_000);

    expect(response).toEqual({ status: 404, body: { message: 'Not Found' } });
  });

  it('a body that is not JSON comes back as null', async () => {
    const fake = new FetchFake(new Response('<html>bad gateway</html>', { status: 502 }));

    const response = await new FetchHttpGet(fake.fetch).getJson(URL_UNDER_TEST, 5_000);

    expect(response).toEqual({ status: 502, body: null });
  });

  it('a server that does not answer within the deadline rejects', async () => {
    const fake = new FetchFake(null, true);

    await expect(new FetchHttpGet(fake.fetch).getJson(URL_UNDER_TEST, 20)).rejects.toThrow();
  });
});
