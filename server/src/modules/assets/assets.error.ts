export type AssetErrorCode =
  | 'ASSET_NOT_FOUND'
  | 'UNSUPPORTED_IMAGE'
  | 'ASSET_TOO_LARGE'
  | 'LINK_BLOCKED'
  | 'LINK_UNREACHABLE'
  | 'LINK_NOT_IMAGE'
  | 'RATE_LIMITED';

/** Every refusal of the assets module, with the code the edges translate into a status. */
export class AssetError extends Error {
  constructor(
    readonly code: AssetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AssetError';
  }
}

/** Bytes that are not a PNG, JPEG or WebP the server is willing to decode; `detail` is the
 *  processor's own words (what was received and what was expected). */
export class UnsupportedImageError extends AssetError {
  constructor(detail: string) {
    super('UNSUPPORTED_IMAGE', detail);
  }
}

/** A file (or a link's answer) above `ASSET_MAX_BYTES`; `received` is `null` when the download
 *  was cut before its end. */
export class AssetTooLargeError extends AssetError {
  constructor(
    readonly limit: number,
    readonly received: number | null,
  ) {
    const size = received === null ? `more than ${limit}` : String(received);
    super('ASSET_TOO_LARGE', `the image has ${size} bytes; expected at most ${limit}`);
  }
}

/** A link that leads (directly, by DNS or by a redirect) to an address that is not public. */
export class LinkBlockedError extends AssetError {
  constructor(
    readonly host: string,
    readonly address: string,
  ) {
    super('LINK_BLOCKED', `link host ${host} is at ${address}; expected a public address`);
  }
}

/** A link that could not be downloaded: refused, missing, too slow or redirected too often. */
export class LinkUnreachableError extends AssetError {
  constructor(
    readonly url: string,
    reason: string,
  ) {
    super('LINK_UNREACHABLE', `link ${url} ${reason}`);
  }
}

// Same code for "does not exist" and "not of your campaign": telling them apart leaks which ids exist.
export class AssetNotFoundError extends AssetError {
  constructor(readonly assetId: string) {
    super('ASSET_NOT_FOUND', `asset ${assetId} is not in a campaign of the requester`);
  }
}

/** A link that answered, but not with an image (an image search page, for instance). */
export class LinkNotImageError extends AssetError {
  constructor(readonly url: string) {
    super('LINK_NOT_IMAGE', `link ${url} does not answer with a png, jpeg or webp image`);
  }
}

export class AssetRateLimitedError extends AssetError {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED', `too many images sent; retry after ${retryAfterSeconds} s`);
  }
}
