export type ProfileErrorCode =
  | 'AVATAR_NOT_FOUND'
  | 'UNSUPPORTED_IMAGE'
  | 'AVATAR_TOO_LARGE'
  | 'LINK_BLOCKED'
  | 'LINK_UNREACHABLE'
  | 'LINK_NOT_IMAGE'
  | 'RATE_LIMITED';

/** Every refusal of the profiles module, with the code the edge translates into a status. */
export class ProfileError extends Error {
  constructor(
    readonly code: ProfileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProfileError';
  }
}

// Same code for "never existed", "replaced" and "malformed id": none of them tells which ids exist.
export class AvatarNotFoundError extends ProfileError {
  constructor(readonly avatarId: string) {
    super('AVATAR_NOT_FOUND', `avatar ${avatarId} is not the photo of any account`);
  }
}

/** Bytes that decode as no photo the server keeps; `detail` is the processor's own words. */
export class UnsupportedAvatarError extends ProfileError {
  constructor(detail: string) {
    super('UNSUPPORTED_IMAGE', detail);
  }
}

/** A body sent with a type that is not one of the photo types (415, not 422). */
export class AvatarMediaTypeError extends ProfileError {
  constructor(readonly contentType: string) {
    super(
      'UNSUPPORTED_IMAGE',
      `content type ${contentType}; expected image/png, image/jpeg, image/webp or image/gif`,
    );
  }
}

export class AvatarTooLargeError extends ProfileError {
  constructor(
    readonly limit: number,
    readonly received: number | null,
  ) {
    const size = received === null ? `more than ${limit}` : String(received);
    super('AVATAR_TOO_LARGE', `the photo has ${size} bytes; expected at most ${limit}`);
  }
}

// The same three link refusals as the table images (assets), with the photo's own codes.
export class AvatarLinkBlockedError extends ProfileError {
  constructor(
    readonly host: string,
    readonly address: string,
  ) {
    super(
      'LINK_BLOCKED',
      `photo link host ${host} resolves to ${address}; expected a public address`,
    );
  }
}

export class AvatarLinkUnreachableError extends ProfileError {
  constructor(
    readonly url: string,
    readonly reason: string,
  ) {
    super('LINK_UNREACHABLE', `photo link ${url} ${reason}`);
  }
}

/** The link answered something that is no photo (a web page, a video): `detail` is the processor's. */
export class AvatarLinkNotImageError extends ProfileError {
  constructor(
    readonly url: string,
    detail: string,
  ) {
    super('LINK_NOT_IMAGE', `photo link ${url} is not a PNG, JPEG, WebP or GIF image: ${detail}`);
  }
}

export class ProfileRateLimitedError extends ProfileError {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED', `too many profile changes; retry after ${retryAfterSeconds} s`);
  }
}
