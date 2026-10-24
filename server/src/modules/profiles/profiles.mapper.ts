import type { ProfileDto, UpdateProfileRequestDto } from '@lorkarium/contracts';
import { memberColorOf } from '@lorkarium/game-core';
import type { ProfileChanges, ProfileRow } from './profiles.dao';

/** Every stored photo is a WebP, whatever was sent. */
export const AVATAR_CONTENT_TYPE = 'image/webp';

/** PO → DTO: the person's own profile, with the effective color and the automatic one apart.
 *
 *  Example: `toProfileDto(row).colorChoice // null when the color is drawn from the id` */
export function toProfileDto(row: ProfileRow): ProfileDto {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    color: memberColorOf(row.id, row.color),
    colorChoice: row.color,
    bio: row.bio,
    avatarId: row.avatarId,
    memberSince: row.createdAt.toISOString(),
  };
}

/** DTO → the columns to write: only the fields that came (an absent field is kept as it is).
 *
 *  Example: `toProfileChanges({ color: null }) // { color: null }` */
export function toProfileChanges(dto: UpdateProfileRequestDto): ProfileChanges {
  return {
    ...(dto.name === undefined ? {} : { name: dto.name }),
    ...(dto.color === undefined ? {} : { color: dto.color }),
    ...(dto.bio === undefined ? {} : { bio: dto.bio }),
  };
}

/** Where a photo lives in the bucket; never a file name (§8.5).
 *
 *  Example: `avatarKeyOf(id) // 'avatars/<id>'` */
export function avatarKeyOf(avatarId: string): string {
  return `avatars/${avatarId}`;
}
