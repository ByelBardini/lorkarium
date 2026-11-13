import type { DmErrorCode } from '@lorkarium/contracts';

export type DirectMessageErrorCode = Exclude<DmErrorCode, 'RATE_LIMITED'>;

/** Every direct message refusal of its own; the gateway turns `code` into the ack error. */
export class DirectMessageError extends Error {
  constructor(
    readonly code: DirectMessageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DirectMessageError';
  }
}

/** The two are not friends (never were, one removed the other, or one blocked the other): the
 *  answer never tells which. */
export class DirectMessageNotFriendsError extends DirectMessageError {
  constructor(
    readonly senderId: string,
    readonly recipientId: string,
  ) {
    super(
      'DM_NOT_FRIENDS',
      `user ${senderId} is not a friend of ${recipientId}; expected a friendship between the two`,
    );
  }
}

/** The friend is offline or invisible: the same code for both, so the invisible is not told
 *  apart. Nothing is saved, so there is no delivery later. */
export class DirectMessageRecipientOfflineError extends DirectMessageError {
  constructor(readonly recipientId: string) {
    super(
      'DM_RECIPIENT_OFFLINE',
      `user ${recipientId} is not visibly online; expected the recipient online or away`,
    );
  }
}

/** The sender is invisible: sending would give them away, and no answer could reach them. */
export class DirectMessageSenderInvisibleError extends DirectMessageError {
  constructor(readonly senderId: string) {
    super(
      'DM_SENDER_INVISIBLE',
      `user ${senderId} is invisible; expected the sender online to send a direct message`,
    );
  }
}
