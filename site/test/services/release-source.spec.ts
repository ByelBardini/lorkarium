import { describe, expect, it } from 'vitest';
import { LATEST_RELEASE_API_URL } from '@/lib/desktop-release';
import { GithubReleaseSource, RELEASE_CACHE_KEY } from '@/services/release-source';
import { githubReleaseBody, RELEASE_0_3_1 } from '../support/github-release';
import { HttpGetFake } from '../support/http-get-fake';
import { SessionCacheFake } from '../support/session-cache-fake';

const NOW = Date.parse('2026-10-25T12:00:00Z');
const MINUTE = 60_000;
const CACHED_RELEASE = { ...RELEASE_0_3_1, version: '0.3.0' };

function sourceWith(http: HttpGetFake, cache: SessionCacheFake): GithubReleaseSource {
  return new GithubReleaseSource({ http, cache, now: () => NOW });
}

function cacheSavedMinutesAgo(minutes: number): SessionCacheFake {
  const cache = new SessionCacheFake();
  const entry = JSON.stringify({ savedAt: NOW - minutes * MINUTE, release: CACHED_RELEASE });
  cache.entries.set(RELEASE_CACHE_KEY, entry);
  return cache;
}

describe('GithubReleaseSource', () => {
  it('a release cached 4 minutes ago is returned without calling GitHub', async () => {
    const http = new HttpGetFake();

    const release = await sourceWith(http, cacheSavedMinutesAgo(4)).latest();

    expect(release).toEqual(CACHED_RELEASE);
    expect(http.calls).toEqual([]);
  });

  it('a release cached 11 minutes ago is fetched again and the cache rewritten', async () => {
    const http = new HttpGetFake().respondWith(200, githubReleaseBody());
    const cache = cacheSavedMinutesAgo(11);

    const release = await sourceWith(http, cache).latest();

    expect(release).toEqual(RELEASE_0_3_1);
    expect(http.calls).toHaveLength(1);
    expect(JSON.parse(cache.writes[0]?.value ?? '')).toEqual({
      savedAt: NOW,
      release: RELEASE_0_3_1,
    });
  });

  it('an empty cache asks the GitHub API with a 5 s deadline', async () => {
    const http = new HttpGetFake().respondWith(200, githubReleaseBody());

    await sourceWith(http, new SessionCacheFake()).latest();

    expect(http.calls).toEqual([{ url: LATEST_RELEASE_API_URL, timeoutMs: 5_000 }]);
  });

  it('a valid 200 returns the release and stores it with the current time', async () => {
    const http = new HttpGetFake().respondWith(200, githubReleaseBody());
    const cache = new SessionCacheFake();

    const release = await sourceWith(http, cache).latest();

    expect(release).toEqual(RELEASE_0_3_1);
    expect(cache.writes).toHaveLength(1);
    expect(JSON.parse(cache.writes[0]?.value ?? '')).toEqual({
      savedAt: NOW,
      release: RELEASE_0_3_1,
    });
  });

  it('the stored release is served by the next source within the max age', async () => {
    const cache = new SessionCacheFake();
    await sourceWith(new HttpGetFake().respondWith(200, githubReleaseBody()), cache).latest();
    const http = new HttpGetFake();

    expect(await sourceWith(http, cache).latest()).toEqual(RELEASE_0_3_1);
    expect(http.calls).toEqual([]);
  });

  it.each([
    ['403 (rate limit)', 403, { message: 'API rate limit exceeded' }],
    ['404 (no release yet)', 404, { message: 'Not Found' }],
    ['200 with a body that is not a release', 200, { assets: 'nope' }],
    ['200 with a non-JSON body', 200, null],
  ])('a %s is null and nothing is cached', async (_label, status, body) => {
    const http = new HttpGetFake().respondWith(status, body);
    const cache = new SessionCacheFake();

    expect(await sourceWith(http, cache).latest()).toBeNull();
    expect(cache.writes).toEqual([]);
  });

  it('a non-200 status is null even when the body looks like a release', async () => {
    const http = new HttpGetFake().respondWith(500, githubReleaseBody());

    expect(await sourceWith(http, new SessionCacheFake()).latest()).toBeNull();
  });

  it('GitHub not answering within the deadline is null', async () => {
    const http = new HttpGetFake().failWith(new DOMException('timed out', 'TimeoutError'));

    expect(await sourceWith(http, new SessionCacheFake()).latest()).toBeNull();
  });

  it('a blocked storage is skipped: the release still comes from GitHub, without throwing', async () => {
    const http = new HttpGetFake().respondWith(200, githubReleaseBody());
    const cache = new SessionCacheFake();
    cache.blocked = true;

    expect(await sourceWith(http, cache).latest()).toEqual(RELEASE_0_3_1);
    expect(http.calls).toHaveLength(1);
  });

  it.each([
    ['corrupted JSON', '{"savedAt":'],
    ['an entry of the wrong shape', JSON.stringify({ savedAt: 'ontem', release: 'x' })],
    ['a release missing its url', JSON.stringify({ savedAt: NOW, release: { version: '0.3.0' } })],
  ])('a cache holding %s is ignored and GitHub is asked', async (_label, entry) => {
    const http = new HttpGetFake().respondWith(200, githubReleaseBody());
    const cache = new SessionCacheFake();
    cache.entries.set(RELEASE_CACHE_KEY, entry);

    expect(await sourceWith(http, cache).latest()).toEqual(RELEASE_0_3_1);
    expect(http.calls).toHaveLength(1);
  });

  it('a custom max age is honored', async () => {
    const http = new HttpGetFake().respondWith(200, githubReleaseBody());
    const source = new GithubReleaseSource({
      http,
      cache: cacheSavedMinutesAgo(4),
      now: () => NOW,
      maxAgeMs: 2 * MINUTE,
    });

    expect(await source.latest()).toEqual(RELEASE_0_3_1);
  });
});
