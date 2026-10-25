import { buildFingerprintOf } from '@/lib/client-build';

/** Which client build the server serves right now, to tell a deploy from the page already open. */
export interface PublishedBuild {
  /** The `buildFingerprintOf` of the published `index.html`; `null` when it could not be read
   *  (offline, the server restarting, a non-2xx answer). */
  fingerprint(): Promise<string | null>;
}

/** The part of `fetch` the published build needs. */
export type FetchPage = (url: string, init: RequestInit) => Promise<Response>;

/** `PublishedBuild` over `GET /`: the server answers the `index.html` with `no-cache`, and
 *  `no-store` keeps the browser from answering with the copy it already has.
 *
 *  Example: `await new FetchPublishedBuild(fetch.bind(window)).fingerprint()` */
export class FetchPublishedBuild implements PublishedBuild {
  constructor(private readonly fetchPage: FetchPage) {}

  async fingerprint(): Promise<string | null> {
    const html = await this.publishedHtml();
    if (html === null) return null;
    return buildFingerprintOf(new DOMParser().parseFromString(html, 'text/html'));
  }

  private async publishedHtml(): Promise<string | null> {
    try {
      const response = await this.fetchPage('/', { cache: 'no-store', credentials: 'same-origin' });
      return response.ok ? await response.text() : null;
    } catch {
      return null;
    }
  }
}
