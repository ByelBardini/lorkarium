import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { ASSET_MAX_BYTES } from '@lorkarium/contracts';
import type {
  FetchedImage,
  FetchOutcome,
  FetchRefusal,
  ImageFetcherPort,
} from '../../modules/assets/image-fetcher.port';
import { publicAddressPolicy, type AddressPolicy } from './address-policy';

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const SCHEMES = new Set(['http:', 'https:']);
const OK = 200;
// Image hosts (Wikimedia among them) refuse a request with no User-Agent; it names the app.
const REQUEST_HEADERS = {
  'user-agent': 'Lorkarium/1.0 (image link fetcher)',
  accept: 'image/avif,image/webp,image/png,image/gif,image/jpeg,image/*;q=0.8',
};

export type GuardedImageFetcherOptions = Readonly<{
  policy?: AddressPolicy;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
}>;

type Hop = { redirectTo: URL } | { image: FetchedImage };

// Carries a refusal through the socket callbacks; `fetch` turns it back into a value.
class FetchRefused extends Error {
  constructor(readonly refusal: FetchRefusal) {
    super(refusal.kind);
    this.name = 'FetchRefused';
  }
}

/** `ImageFetcherPort` over `node:http`/`node:https`. Every address a host resolves to passes the
 *  policy inside the socket's own `lookup`, so the connection goes to the very IP that was
 *  checked (no DNS rebinding between check and connect); every redirect is checked again.
 *
 *  Example: `await new GuardedImageFetcher().fetch('https://example.com/map.png')` */
export class GuardedImageFetcher implements ImageFetcherPort {
  private readonly policy: AddressPolicy;
  private readonly maxBytes: number;
  private readonly timeoutMs: number;
  private readonly maxRedirects: number;

  constructor(options: GuardedImageFetcherOptions = {}) {
    this.policy = options.policy ?? publicAddressPolicy;
    this.maxBytes = options.maxBytes ?? ASSET_MAX_BYTES;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRedirects = options.maxRedirects ?? 3;
  }

  async fetch(url: string): Promise<FetchOutcome> {
    try {
      return { ok: true, image: await this.follow(new URL(url)) };
    } catch (error) {
      if (error instanceof FetchRefused) return { ok: false, refusal: error.refusal };
      throw error;
    }
  }

  private async follow(start: URL): Promise<FetchedImage> {
    const signal = AbortSignal.timeout(this.timeoutMs);
    let current = start;
    for (let redirects = 0; redirects <= this.maxRedirects; redirects += 1) {
      const hop = await this.hop(current, signal);
      if ('image' in hop) return hop.image;
      current = hop.redirectTo;
    }
    throw unreachable(`made too many redirects (more than ${this.maxRedirects})`);
  }

  private hop(url: URL, signal: AbortSignal): Promise<Hop> {
    this.requireAllowedTarget(url);
    const client = url.protocol === 'https:' ? https : http;
    return new Promise<Hop>((resolve, reject) => {
      const request = client.get(url, {
        headers: REQUEST_HEADERS,
        lookup: this.guardedLookup(),
        signal,
        agent: false,
      });
      request.on('response', (response) => {
        this.answer(url, response).then(resolve, (error: Error) =>
          reject(this.failureOf(error, signal)),
        );
      });
      request.on('error', (error) => reject(this.failureOf(error, signal)));
    });
  }

  private requireAllowedTarget(url: URL): void {
    if (!SCHEMES.has(url.protocol)) throw blocked(url.host, `scheme ${url.protocol}`);
    // A literal IP never goes through `lookup`, so it is checked here.
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host) !== 0 && !this.policy.allows(host)) throw blocked(url.host, host);
  }

  private guardedLookup(): LookupFunction {
    return (hostname, options, callback) => {
      dnsLookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
        if (error) return callback(error, '', 0);
        const refused = addresses.find((entry) => !this.policy.allows(entry.address));
        if (refused) return callback(blocked(hostname, refused.address), '', 0);
        if (options.all) return callback(null, addresses);
        const [first] = addresses;
        return callback(null, first?.address ?? '', first?.family ?? 0);
      });
    };
  }

  private async answer(url: URL, response: IncomingMessage): Promise<Hop> {
    const status = response.statusCode ?? 0;
    const location = response.headers.location;
    if (REDIRECTS.has(status) && location !== undefined) {
      response.resume();
      return { redirectTo: new URL(location, url) };
    }
    if (status !== OK) {
      response.resume();
      throw unreachable(`answered HTTP ${status}`);
    }
    const bytes = await this.bodyOf(response);
    return { image: { bytes, contentType: response.headers['content-type'] ?? null } };
  }

  private async bodyOf(response: IncomingMessage): Promise<Uint8Array> {
    const declared = Number(response.headers['content-length'] ?? 0);
    if (declared > this.maxBytes) this.cut(response, declared);
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of response) {
      total += (chunk as Buffer).byteLength;
      if (total > this.maxBytes) this.cut(response, null);
      chunks.push(chunk as Buffer);
    }
    return new Uint8Array(Buffer.concat(chunks));
  }

  private cut(response: IncomingMessage, received: number | null): never {
    response.destroy();
    throw new FetchRefused({ kind: 'too-large', limit: this.maxBytes, received });
  }

  private failureOf(error: Error, signal: AbortSignal): Error {
    if (error instanceof FetchRefused) return error;
    if (signal.aborted) return unreachable(`did not answer within ${this.timeoutMs} ms`);
    const code = (error as NodeJS.ErrnoException).code ?? error.name;
    return unreachable(`could not be reached (${code})`);
  }
}

function blocked(host: string, address: string): FetchRefused {
  return new FetchRefused({ kind: 'blocked', host, address });
}

function unreachable(reason: string): FetchRefused {
  return new FetchRefused({ kind: 'unreachable', reason });
}
