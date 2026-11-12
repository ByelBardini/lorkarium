/** How a protected asset is cached: the browser keeps it but asks again on every use, so the
 *  permission is checked each time and only the bytes are spared. */
export const PROTECTED_ASSET_CACHE_CONTROL = 'private, no-cache';

/** The validator of an asset's bytes: an id never changes content, so the id is enough.
 *
 *  Example: `assetEtagOf('6f1c…') // '"6f1c…"'` */
export function assetEtagOf(assetId: string): string {
  return `"${assetId}"`;
}

/** Whether an `If-None-Match` header names `etag` (a list, a weak `W/` form or `*`), so the
 *  answer can be 304 without the bytes. An absent header never matches.
 *
 *  Example: `isRevalidated('W/"a", "b"', '"b"') // true` */
export function isRevalidated(ifNoneMatch: string | undefined, etag: string): boolean {
  if (ifNoneMatch === undefined) return false;
  const tags = ifNoneMatch.split(',').map((tag) => tag.trim().replace(/^W\//, ''));
  return tags.some((tag) => tag === '*' || tag === etag);
}
