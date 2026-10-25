import { FetchHttpGet } from '@/services/http-get';
import { GithubReleaseSource, type ReleaseSource } from '@/services/release-source';
import { BrowserSessionCache } from '@/services/session-cache';

/**
 * The release source the pages use in the browser: GitHub API, session cache, wall clock.
 * Example: `const release = await browserReleaseSource().latest()`
 */
export function browserReleaseSource(): ReleaseSource {
  return new GithubReleaseSource({
    http: new FetchHttpGet(),
    cache: new BrowserSessionCache(),
    now: () => Date.now(),
  });
}
