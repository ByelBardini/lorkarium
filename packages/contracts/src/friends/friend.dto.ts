import { z } from 'zod';
import { memberColorDto, usernameDto } from '../account/username.dto';
import { userPlanDto } from '../plans/user-plan.dto';

/** An @ as people type it: an optional leading "@" is dropped, then the account @ rules apply.
 *
 *  Example: `typedUsernameDto.parse(' @BiaFlor ') // 'biaflor'` */
export const typedUsernameDto = z
  .string()
  .trim()
  .transform((typed) => typed.replace(/^@/, ''))
  .pipe(usernameDto);

/** The public profile of another account on the friends screen: never the e-mail.
 *
 *  Example: `friendProfileDto.parse(row).username // 'biaflor'` */
export const friendProfileDto = z.strictObject({
  userId: z.uuid(),
  username: z.string(),
  name: z.string(),
  color: memberColorDto,
  avatarId: z.uuid().nullable(),
  plan: userPlanDto,
  admin: z.boolean(),
  lorkariumOwner: z.boolean(),
});
export type FriendProfileDto = z.infer<typeof friendProfileDto>;

/** A friend: the profile and since when (answer of the accept route, too).
 *
 *  Example: `friendDto.parse(body).since` */
export const friendDto = friendProfileDto.extend({ since: z.iso.datetime() });
export type FriendDto = z.infer<typeof friendDto>;
