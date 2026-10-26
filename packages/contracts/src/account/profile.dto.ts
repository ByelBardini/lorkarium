import { z } from 'zod';
import { diceNumberColorDto } from './dice-texture.dto';
import { memberColorDto } from './username.dto';

export const PROFILE_NAME_MAX_LENGTH = 32;
export const PROFILE_BIO_MAX_LENGTH = 190;

/** The nickname shown to the table: trimmed, 1 to 32 characters. */
export const profileNameDto = z.string().trim().min(1).max(PROFILE_NAME_MAX_LENGTH);

/** "Sobre você": trimmed, up to 190 characters; an empty text clears it (`null`). */
export const profileBioDto = z
  .string()
  .trim()
  .max(PROFILE_BIO_MAX_LENGTH)
  .transform((bio) => (bio === '' ? null : bio))
  .nullable();

/** The signed-in person's own profile. `color` is the effective one; `colorChoice` is `null` when
 *  the color is the automatic one drawn from the id. The dice appearance rides along: the texture
 *  (`null` = the profile color) and the number color (`null` = automatic contrast).
 *
 *  Example: `profileDto.parse(body.profile).colorChoice // null` */
export const profileDto = z.strictObject({
  id: z.uuid(),
  username: z.string(),
  name: z.string(),
  color: memberColorDto,
  colorChoice: memberColorDto.nullable(),
  bio: z.string().nullable(),
  avatarId: z.uuid().nullable(),
  diceTextureId: z.uuid().nullable(),
  diceNumberColor: diceNumberColorDto.nullable(),
  memberSince: z.iso.datetime(),
});

export type ProfileDto = z.infer<typeof profileDto>;

/** Response of `GET`/`PATCH /api/account/profile` and of the avatar and dice texture routes. */
export const profileResponseDto = z.strictObject({ profile: profileDto });

export type ProfileResponseDto = z.infer<typeof profileResponseDto>;

/** Body of `PATCH /api/account/profile`; strict, so a `username` (immutable) is refused, and at
 *  least one field must come. `color: null` goes back to the automatic color and
 *  `diceNumberColor: null` to the automatic number color.
 *
 *  Example: `updateProfileRequestDto.parse({ bio: '' }) // { bio: null }` */
export const updateProfileRequestDto = z
  .strictObject({
    name: profileNameDto.optional(),
    color: memberColorDto.nullable().optional(),
    bio: profileBioDto.optional(),
    diceNumberColor: diceNumberColorDto.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    error: 'Empty profile update: expected at least one of name, color, bio, diceNumberColor.',
  });

export type UpdateProfileRequestDto = z.infer<typeof updateProfileRequestDto>;
export type UpdateProfileRequestInput = z.input<typeof updateProfileRequestDto>;
