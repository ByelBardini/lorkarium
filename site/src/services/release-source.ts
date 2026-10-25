import { z } from 'zod';
import {
  desktopReleaseOf,
  LATEST_RELEASE_API_URL,
  type DesktopRelease,
} from '@/lib/desktop-release';
import type { HttpGet } from '@/services/http-get';
import type { SessionCache } from '@/services/session-cache';

export const RELEASE_CACHE_KEY = 'lorkarium:desktop-release';

/** Where the landing page learns the latest desktop installer. */
export interface ReleaseSource {
  latest(): Promise<DesktopRelease | null>;
}

export interface GithubReleaseSourceDeps {
  http: HttpGet;
  cache: SessionCache;
  now: () => number;
  maxAgeMs?: number;
  timeoutMs?: number;
}

const cachedReleaseSchema = z.object({
  savedAt: z.number(),
  release: z.object({
    version: z.string(),
    sizeBytes: z.number(),
    url: z.string().startsWith('https://github.com/'),
    publishedAt: z.string(),
  }),
});

type CachedRelease = z.infer<typeof cachedReleaseSchema>;

/**
 * The GitHub `releases/latest` API behind a per-tab cache, so a visitor does not spend the 60 requests/hour
 * an IP gets without a token. Every failure becomes `null`: the page then falls back to the releases page.
 * Example: `await new GithubReleaseSource({ http, cache, now: Date.now }).latest() // { version: '0.3.1', … }`
 */
export class GithubReleaseSource implements ReleaseSource {
  private readonly http: HttpGet;
  private readonly cache: SessionCache;
  private readonly now: () => number;
  private readonly maxAgeMs: number;
  private readonly timeoutMs: number;

  constructor({
    http,
    cache,
    now,
    maxAgeMs = 600_000,
    timeoutMs = 5_000,
  }: GithubReleaseSourceDeps) {
    this.http = http;
    this.cache = cache;
    this.now = now;
    this.maxAgeMs = maxAgeMs;
    this.timeoutMs = timeoutMs;
  }

  /**
   * The cached release while fresh, otherwise the one GitHub returns now; null when neither is usable.
   * Example: `const release = await source.latest(); if (!release) showReleasesPageLink();`
   */
  async latest(): Promise<DesktopRelease | null> {
    const cached = this.freshCachedRelease();
    if (cached) return cached;
    const release = await this.fetchRelease();
    if (release) this.store(release);
    return release;
  }

  private freshCachedRelease(): DesktopRelease | null {
    const cached = this.readCache();
    if (!cached) return null;
    const ageMs = this.now() - cached.savedAt;
    return ageMs >= 0 && ageMs < this.maxAgeMs ? cached.release : null;
  }

  private readCache(): CachedRelease | null {
    try {
      const raw = this.cache.read(RELEASE_CACHE_KEY);
      const parsed = cachedReleaseSchema.safeParse(raw === null ? null : JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private async fetchRelease(): Promise<DesktopRelease | null> {
    try {
      const response = await this.http.getJson(LATEST_RELEASE_API_URL, this.timeoutMs);
      return response.status === 200 ? desktopReleaseOf(response.body) : null;
    } catch {
      return null;
    }
  }

  private store(release: DesktopRelease): void {
    const entry: CachedRelease = { savedAt: this.now(), release };
    try {
      this.cache.write(RELEASE_CACHE_KEY, JSON.stringify(entry));
    } catch {
      // Storage blocked or full: the release is still good, it just will not be reused.
    }
  }
}
