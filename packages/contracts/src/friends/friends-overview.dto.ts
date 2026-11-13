import { z } from 'zod';
import { BLOCKS_MAX, FRIENDS_MAX, OUTGOING_REQUESTS_MAX } from '../realtime-limits';
import { blockedUserDto } from './block.dto';
import { friendDto } from './friend.dto';
import { friendRequestEntryDto } from './friend-request.dto';

/** Answer of `GET /api/friends`. `incoming` has no ceiling of its own: the others' outgoing one
 *  bounds it per sender, not in total.
 *
 *  Example: `friendsOverviewDto.parse(body).incoming.length` */
export const friendsOverviewDto = z.strictObject({
  friends: z.array(friendDto).max(FRIENDS_MAX),
  incoming: z.array(friendRequestEntryDto),
  outgoing: z.array(friendRequestEntryDto).max(OUTGOING_REQUESTS_MAX),
  blocked: z.array(blockedUserDto).max(BLOCKS_MAX),
});
export type FriendsOverviewDto = z.infer<typeof friendsOverviewDto>;
