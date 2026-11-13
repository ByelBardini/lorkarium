import { z } from 'zod';
import { friendProfileDto, typedUsernameDto } from './friend.dto';

/** Body of `POST /api/friends/requests`: the @ of the other account.
 *
 *  Example: `friendRequestDto.parse({ username: '@Bia' }).username // 'bia'` */
export const friendRequestDto = z.strictObject({ username: typedUsernameDto });
export type FriendRequestDto = z.infer<typeof friendRequestDto>;

/** `accepted` when the other one had already asked me. A request to someone who blocked me also
 *  answers `sent`: the block is never revealed.
 *
 *  Example: `friendRequestResponseDto.parse(body).outcome // 'sent'` */
export const friendRequestResponseDto = z.strictObject({
  outcome: z.enum(['sent', 'accepted']),
});
export type FriendRequestResponseDto = z.infer<typeof friendRequestResponseDto>;

/** A pending request, received or sent, with when it was made.
 *
 *  Example: `friendRequestEntryDto.parse(row).at` */
export const friendRequestEntryDto = friendProfileDto.extend({ at: z.iso.datetime() });
export type FriendRequestEntryDto = z.infer<typeof friendRequestEntryDto>;

/** The error codes of the friend and block routes (`apiErrorDto.code`). */
export const FRIEND_ERROR_CODES = {
  userNotFound: 'USER_NOT_FOUND',
  alreadyFriends: 'ALREADY_FRIENDS',
  requestAlreadySent: 'REQUEST_ALREADY_SENT',
  requestToSelf: 'REQUEST_TO_SELF',
  userBlockedByYou: 'USER_BLOCKED_BY_YOU',
  friendLimit: 'FRIEND_LIMIT',
  outgoingRequestLimit: 'OUTGOING_REQUEST_LIMIT',
  requestNotFound: 'REQUEST_NOT_FOUND',
  friendNotFound: 'FRIEND_NOT_FOUND',
  alreadyBlocked: 'ALREADY_BLOCKED',
  blockLimit: 'BLOCK_LIMIT',
  blockNotFound: 'BLOCK_NOT_FOUND',
} as const;
export type FriendErrorCode = (typeof FRIEND_ERROR_CODES)[keyof typeof FRIEND_ERROR_CODES];
