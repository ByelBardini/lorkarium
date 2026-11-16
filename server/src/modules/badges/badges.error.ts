export type BadgesErrorCode =
  | 'BADGE_NAME_TAKEN'
  | 'BADGE_NOT_FOUND'
  | 'BADGE_ORDER_STALE'
  | 'BADGE_WITHOUT_IMAGE'
  | 'BADGE_IMAGE_TOO_LARGE'
  | 'BADGE_IMAGE_NOT_FOUND'
  | 'UNSUPPORTED_IMAGE'
  | 'USER_NOT_FOUND'
  | 'RATE_LIMITED';

/** Every refusal of the badges module; the edge turns `code` into the HTTP status. */
export class BadgesError extends Error {
  constructor(
    readonly code: BadgesErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BadgesError';
  }
}

export class BadgeNameTakenError extends BadgesError {
  constructor(readonly badgeName: string) {
    super(
      'BADGE_NAME_TAKEN',
      `badge name "${badgeName}" is taken: expected a name no other badge has, in any case`,
    );
  }
}

export class BadgeNotFoundError extends BadgesError {
  constructor(readonly badgeId: string) {
    super('BADGE_NOT_FOUND', `badge ${badgeId} not found: expected a badge of the catalog`);
  }
}

/** The order sent is not a permutation of the current catalog (one was created or deleted). */
export class BadgeOrderStaleError extends BadgesError {
  constructor(
    readonly missing: readonly string[],
    readonly extra: readonly string[],
  ) {
    super(
      'BADGE_ORDER_STALE',
      `badge order is stale: missing [${missing.join(', ')}], unknown [${extra.join(', ')}]; expected every catalog id once`,
    );
  }
}

export class BadgeWithoutImageError extends BadgesError {
  constructor(readonly badgeId: string) {
    super(
      'BADGE_WITHOUT_IMAGE',
      `badge ${badgeId} has no image: expected an image before it is granted`,
    );
  }
}

export class BadgeImageTooLargeError extends BadgesError {
  constructor(
    readonly limit: number,
    readonly received: number | null,
  ) {
    const size = received === null ? `more than ${limit}` : String(received);
    super('BADGE_IMAGE_TOO_LARGE', `the badge image has ${size} bytes; expected at most ${limit}`);
  }
}

// Same code for "never existed", "replaced" and "malformed id": none of them tells which ids exist.
export class BadgeImageNotFoundError extends BadgesError {
  constructor(readonly imageId: string) {
    super('BADGE_IMAGE_NOT_FOUND', `badge image ${imageId} is not the image of any badge`);
  }
}

/** Bytes that decode as no image the server keeps; `detail` is the processor's own words. */
export class UnsupportedBadgeImageError extends BadgesError {
  constructor(detail: string) {
    super('UNSUPPORTED_IMAGE', detail);
  }
}

/** A body sent with a type that is not one of the image types (415, not 422). */
export class BadgeImageMediaTypeError extends BadgesError {
  constructor(readonly contentType: string) {
    super(
      'UNSUPPORTED_IMAGE',
      `content type ${contentType}; expected image/png, image/jpeg, image/webp or image/gif`,
    );
  }
}

export class BadgeAccountNotFoundError extends BadgesError {
  constructor(readonly userId: string) {
    super('USER_NOT_FOUND', `account ${userId} not found: expected an existing account`);
  }
}

export class BadgesRateLimitedError extends BadgesError {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED', `too many badge changes; retry after ${retryAfterSeconds} s`);
  }
}
