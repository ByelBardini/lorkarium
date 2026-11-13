import { FRIEND_ERROR_CODES, type FriendErrorCode } from '@lorkarium/contracts';

export type FriendsErrorCode = FriendErrorCode | 'RATE_LIMITED';

/** Every refusal of the friends module; the edge turns `code` into the HTTP status. */
export class FriendsError extends Error {
  constructor(
    readonly code: FriendsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FriendsError';
  }
}

export class FriendUserNotFoundError extends FriendsError {
  constructor(readonly lookup: string) {
    super(
      FRIEND_ERROR_CODES.userNotFound,
      `no account matches ${lookup}; expected an existing @ or id`,
    );
  }
}

export class RequestToSelfError extends FriendsError {
  constructor(readonly userId: string) {
    super(
      FRIEND_ERROR_CODES.requestToSelf,
      `account ${userId} targeted itself; expected the id or @ of another account`,
    );
  }
}

export class AlreadyFriendsError extends FriendsError {
  constructor(
    readonly userId: string,
    readonly otherId: string,
  ) {
    super(
      FRIEND_ERROR_CODES.alreadyFriends,
      `accounts ${userId} and ${otherId} are already friends`,
    );
  }
}

export class RequestAlreadySentError extends FriendsError {
  constructor(
    readonly fromUserId: string,
    readonly toUserId: string,
  ) {
    super(
      FRIEND_ERROR_CODES.requestAlreadySent,
      `account ${fromUserId} already has a pending request to ${toUserId}`,
    );
  }
}

export class UserBlockedByYouError extends FriendsError {
  constructor(
    readonly blockerId: string,
    readonly blockedId: string,
  ) {
    super(
      FRIEND_ERROR_CODES.userBlockedByYou,
      `account ${blockerId} blocked ${blockedId}; expected an unblock before a request`,
    );
  }
}

export class FriendLimitError extends FriendsError {
  constructor(
    readonly userId: string,
    readonly friendCount: number,
    readonly limit: number,
  ) {
    super(
      FRIEND_ERROR_CODES.friendLimit,
      `account ${userId} has ${friendCount} of ${limit} friends; expected fewer than ${limit}`,
    );
  }
}

export class OutgoingRequestLimitError extends FriendsError {
  constructor(
    readonly userId: string,
    readonly pendingCount: number,
    readonly limit: number,
  ) {
    super(
      FRIEND_ERROR_CODES.outgoingRequestLimit,
      `account ${userId} has ${pendingCount} of ${limit} pending requests; expected fewer than ${limit}`,
    );
  }
}

export class FriendRequestNotFoundError extends FriendsError {
  constructor(
    readonly userId: string,
    readonly otherId: string,
  ) {
    super(
      FRIEND_ERROR_CODES.requestNotFound,
      `no pending request between ${userId} and ${otherId} for this action`,
    );
  }
}

export class FriendNotFoundError extends FriendsError {
  constructor(
    readonly userId: string,
    readonly otherId: string,
  ) {
    super(FRIEND_ERROR_CODES.friendNotFound, `accounts ${userId} and ${otherId} are not friends`);
  }
}

export class AlreadyBlockedError extends FriendsError {
  constructor(
    readonly blockerId: string,
    readonly blockedId: string,
  ) {
    super(FRIEND_ERROR_CODES.alreadyBlocked, `account ${blockerId} already blocked ${blockedId}`);
  }
}

export class BlockLimitError extends FriendsError {
  constructor(
    readonly userId: string,
    readonly blockCount: number,
    readonly limit: number,
  ) {
    super(
      FRIEND_ERROR_CODES.blockLimit,
      `account ${userId} has ${blockCount} of ${limit} blocks; expected fewer than ${limit}`,
    );
  }
}

export class BlockNotFoundError extends FriendsError {
  constructor(
    readonly blockerId: string,
    readonly blockedId: string,
  ) {
    super(FRIEND_ERROR_CODES.blockNotFound, `account ${blockerId} has not blocked ${blockedId}`);
  }
}

export class FriendsRateLimitedError extends FriendsError {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED', `too many friend changes; retry in ${retryAfterSeconds} s`);
  }
}
