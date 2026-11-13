import { z } from 'zod';
import { friendProfileDto, typedUsernameDto } from './friend.dto';

/** Body of `POST /api/blocks`: by id (a friend, a request) or by @ (a stranger), never both.
 *
 *  Example: `blockRequestDto.parse({ username: '@Bia' }) // { username: 'bia' }` */
export const blockRequestDto = z.union([
  z.strictObject({ userId: z.uuid() }),
  z.strictObject({ username: typedUsernameDto }),
]);
export type BlockRequestDto = z.infer<typeof blockRequestDto>;

/** Params `:userId` of the friend, request and block routes.
 *
 *  Example: `friendUserParamsDto.parse(request.params).userId` */
export const friendUserParamsDto = z.strictObject({ userId: z.uuid() });
export type FriendUserParamsDto = z.infer<typeof friendUserParamsDto>;

/** A blocked account (answer of `POST /api/blocks`, 201), with when it was blocked.
 *
 *  Example: `blockedUserDto.parse(body).at` */
export const blockedUserDto = friendProfileDto.extend({ at: z.iso.datetime() });
export type BlockedUserDto = z.infer<typeof blockedUserDto>;
