import { CUSTOM_EMOJI_ERROR_CODES } from '@lorkarium/contracts';

export type CustomEmojiErrorCode =
  | (typeof CUSTOM_EMOJI_ERROR_CODES)[keyof typeof CUSTOM_EMOJI_ERROR_CODES]
  | 'UNSUPPORTED_IMAGE'
  | 'RATE_LIMITED';

/** Every refusal of the custom emojis; the edge turns `code` into the HTTP status. */
export class CustomEmojiError extends Error {
  constructor(
    readonly code: CustomEmojiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CustomEmojiError';
  }
}

export class CustomEmojiNotFoundError extends CustomEmojiError {
  constructor(emojiId: string) {
    super(CUSTOM_EMOJI_ERROR_CODES.notFound, `custom emoji ${emojiId} not found for this account`);
  }
}

export class CustomEmojiNameTakenError extends CustomEmojiError {
  constructor(name: string) {
    super(
      CUSTOM_EMOJI_ERROR_CODES.nameTaken,
      `the account already has an emoji named "${name}": expected a name it does not use`,
    );
  }
}

export class CustomEmojiTooLargeError extends CustomEmojiError {
  constructor(maxBytes: number, received: number | null) {
    const size = received === null ? 'a larger body' : `${received} bytes`;
    super(CUSTOM_EMOJI_ERROR_CODES.tooLarge, `got ${size}: expected at most ${maxBytes} bytes`);
  }
}

export class UnsupportedCustomEmojiError extends CustomEmojiError {
  constructor(detail: string) {
    super('UNSUPPORTED_IMAGE', detail);
  }
}

export class CustomEmojiMediaTypeError extends CustomEmojiError {
  constructor(contentType: string) {
    super(
      'UNSUPPORTED_IMAGE',
      `got content-type ${contentType}: expected image/png, jpeg, webp or gif`,
    );
  }
}

export class CustomEmojiRateLimitedError extends CustomEmojiError {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED', `too many emoji changes: retry in ${retryAfterSeconds} s`);
  }
}
