import type { AssetBytesAnswer, AssetBytesReader } from '@/services/sheets-api';

/** The asset route as bytes: `answer` is what every read gets (`'offline'` throws like a
 *  network failure); `urls` keeps what was read.
 *
 *  Example: `reader.answer = { status: 200, contentType: 'image/webp', bytes: async () => buffer }` */
export class AssetBytesReaderFake {
  readonly urls: string[] = [];
  answer: AssetBytesAnswer | 'offline' = {
    status: 404,
    contentType: null,
    bytes: async () => new ArrayBuffer(0),
  };

  readonly read: AssetBytesReader = async (url) => {
    this.urls.push(url);
    if (this.answer === 'offline') throw new TypeError('Failed to fetch');
    return this.answer;
  };
}

/** `fetch` answering one `Response`; `calls` keeps the url and the init of each call.
 *
 *  Example: `new FetchFake(new Response(bytes, { headers: { 'content-type': 'image/png' } }))` */
export class FetchFake {
  readonly calls: Array<Readonly<{ url: string; init: RequestInit | undefined }>> = [];

  constructor(private readonly response: Response) {}

  readonly fetch: typeof fetch = async (input, init) => {
    this.calls.push({ url: String(input), init });
    return this.response;
  };
}
