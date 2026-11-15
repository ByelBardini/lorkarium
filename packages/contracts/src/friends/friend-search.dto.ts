import { z } from 'zod';
import { friendProfileDto } from './friend.dto';

/** Fewest characters of @ a search needs: one letter would list half the accounts. */
export const FRIEND_SEARCH_MIN_LENGTH = 2;
/** Most accounts one search answers; the person types more to narrow it. */
export const FRIEND_SEARCH_LIMIT = 10;
const FRIEND_SEARCH_MAX_LENGTH = 32;

/** Query of `GET /api/friends/search`: the start of an @, as people type it.
 *
 *  Example: `friendSearchQueryDto.parse({ q: ' @Bi ' }).q // 'bi'` */
export const friendSearchQueryDto = z.strictObject({
  q: z
    .string()
    .trim()
    .toLowerCase()
    .transform((typed) => typed.replace(/^@/, ''))
    .pipe(
      z
        .string()
        .min(FRIEND_SEARCH_MIN_LENGTH)
        .max(FRIEND_SEARCH_MAX_LENGTH)
        .regex(/^[a-z0-9._]+$/, {
          error: (issue) =>
            `Search "${String(issue.input)}" has a character out of the format: expected only a-z 0-9 . _`,
        }),
    ),
});
export type FriendSearchQueryDto = z.infer<typeof friendSearchQueryDto>;

/** Accounts whose @ starts with the query that can still get a request: never me, a friend, a
 *  pending request either way, or someone I blocked. Ordered by @.
 *
 *  Example: `friendSearchResultDto.parse(body).accounts[0].username // 'bia'` */
export const friendSearchResultDto = z.strictObject({
  accounts: z.array(friendProfileDto).max(FRIEND_SEARCH_LIMIT),
});
export type FriendSearchResultDto = z.infer<typeof friendSearchResultDto>;
