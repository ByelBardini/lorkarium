/** What a link answered; the type is only a hint, the image processor decides. */
export type FetchedImage = Readonly<{ bytes: Uint8Array; contentType: string | null }>;

/** Why a link was not downloaded: it led to an address that is not public, it could not be
 *  reached (refused, missing, too slow, too many redirects) or it sent more than the limit
 *  (`received` is `null` when the download was cut before its end). */
export type FetchRefusal =
  | Readonly<{ kind: 'blocked'; host: string; address: string }>
  | Readonly<{ kind: 'unreachable'; reason: string }>
  | Readonly<{ kind: 'too-large'; limit: number; received: number | null }>;

export type FetchOutcome =
  Readonly<{ ok: true; image: FetchedImage }> | Readonly<{ ok: false; refusal: FetchRefusal }>;

/** Downloads the image behind a public link, never reaching an internal address (SSRF); a
 *  refusal comes back as a value, never thrown. */
export interface ImageFetcherPort {
  fetch(url: string): Promise<FetchOutcome>;
}
