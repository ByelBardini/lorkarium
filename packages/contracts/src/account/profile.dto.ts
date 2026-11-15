import { z } from 'zod';
import { userPlanDto } from '../plans/user-plan.dto';
import { diceNumberColorDto } from './dice-texture.dto';
import { memberColorDto } from './username.dto';

export const PROFILE_NAME_MAX_LENGTH = 32;
export const PROFILE_BIO_MAX_LENGTH = 190;
export const PROFILE_GAME_SYSTEMS_MAX_LENGTH = 300;
export const PROFILE_PLAY_SCHEDULE_MAX_LENGTH = 200;
export const PROFILE_CONTACT_MAX_LENGTH = 200;

/** The nickname shown to the table: trimmed, 1 to 32 characters. */
export const profileNameDto = z.string().trim().min(1).max(PROFILE_NAME_MAX_LENGTH);

/** A free profile text: trimmed, up to `max` characters; an empty text clears it (`null`).
 *
 *  Example: `profileFreeTextDto(200).parse('  ') // null` */
function profileFreeTextDto(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((text) => (text === '' ? null : text))
    .nullable();
}

/** "Sobre você": trimmed, up to 190 characters; an empty text clears it (`null`). */
export const profileBioDto = profileFreeTextDto(PROFILE_BIO_MAX_LENGTH);

/** Systems and settings the person plays, free text (no badges). */
export const profileGameSystemsDto = profileFreeTextDto(PROFILE_GAME_SYSTEMS_MAX_LENGTH);

/** When the person usually plays, free text. */
export const profilePlayScheduleDto = profileFreeTextDto(PROFILE_PLAY_SCHEDULE_MAX_LENGTH);

/** How to reach the person outside the Lorkarium (Discord, e-mail...), free text. */
export const profileContactDto = profileFreeTextDto(PROFILE_CONTACT_MAX_LENGTH);

/** The signed-in person's own profile. `color` is the effective one; `colorChoice` is `null` when
 *  the color is the automatic one drawn from the id. The dice appearance rides along: the texture
 *  (`null` = the profile color) and the number color (`null` = automatic contrast). `bannerId` is the 3:1 banner (`null` = the
 *  profile color) and the game preferences are free texts. `plan`,
 *  `admin` (the global role) and `lorkariumOwner` (the Dono do Lorkarium) pick the seal.
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
  bannerId: z.uuid().nullable(),
  gameSystems: z.string().nullable(),
  playSchedule: z.string().nullable(),
  contact: z.string().nullable(),
  diceTextureId: z.uuid().nullable(),
  diceNumberColor: diceNumberColorDto.nullable(),
  memberSince: z.iso.datetime(),
  plan: userPlanDto,
  admin: z.boolean(),
  lorkariumOwner: z.boolean(),
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
    gameSystems: profileGameSystemsDto.optional(),
    playSchedule: profilePlayScheduleDto.optional(),
    contact: profileContactDto.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    error:
      'Empty profile update: expected at least one of name, color, bio, diceNumberColor, gameSystems, playSchedule, contact.',
  });

export type UpdateProfileRequestDto = z.infer<typeof updateProfileRequestDto>;
export type UpdateProfileRequestInput = z.input<typeof updateProfileRequestDto>;
