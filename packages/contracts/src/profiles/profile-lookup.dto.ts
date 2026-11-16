import { z } from 'zod';
import { typedUsernameDto } from '../friends/friend.dto';

/** Params of `GET /api/users/by-username/:username/card`: the exact @ as typed (with or without
 *  "@", any case). An e-mail fails the @ format, so the lookup never becomes an e-mail probe.
 *
 *  Example: `profileLookupParamsDto.parse({ username: '@Bia' }).username // 'bia'` */
export const profileLookupParamsDto = z.strictObject({ username: typedUsernameDto });
export type ProfileLookupParamsDto = z.infer<typeof profileLookupParamsDto>;
