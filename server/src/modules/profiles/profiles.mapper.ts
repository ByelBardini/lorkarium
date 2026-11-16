import type { BadgeDto, ProfileDto, UpdateProfileRequestDto } from '@lorkarium/contracts';
import { memberColorOf } from '@lorkarium/game-core';
import type { ProfileChanges, ProfileRow } from './profiles.dao';

/** Every stored photo is a WebP, whatever was sent. */
export const AVATAR_CONTENT_TYPE = 'image/webp';

/** PO → DTO: the person's own profile, with the effective color and the automatic one apart,
 *  and the badges others see on the card.
 *
 *  Example: `toProfileDto(row, []).colorChoice // null when the color is drawn from the id` */
export function toProfileDto(row: ProfileRow, badges: readonly BadgeDto[]): ProfileDto {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    color: memberColorOf(row.id, row.color),
    colorChoice: row.color,
    bio: row.bio,
    avatarId: row.avatarId,
    bannerId: row.bannerId,
    gameSystems: row.gameSystems,
    playSchedule: row.playSchedule,
    contact: row.contact,
    diceTextureId: row.diceTextureId,
    diceNumberColor: row.diceNumberColor,
    memberSince: row.createdAt.toISOString(),
    plan: row.plan,
    admin: row.role === 'admin',
    lorkariumOwner: row.lorkariumOwner,
    badges: [...badges],
  };
}

const PROFILE_CHANGE_FIELDS = [
  'name',
  'color',
  'bio',
  'diceNumberColor',
  'gameSystems',
  'playSchedule',
  'contact',
] as const satisfies readonly (keyof ProfileChanges & keyof UpdateProfileRequestDto)[];

/** DTO → the columns to write: only the fields that came (an absent field is kept as it is).
 *
 *  Example: `toProfileChanges({ color: null }) // { color: null }` */
export function toProfileChanges(dto: UpdateProfileRequestDto): ProfileChanges {
  const changes: ProfileChanges = {};
  for (const field of PROFILE_CHANGE_FIELDS) {
    if (dto[field] !== undefined) Object.assign(changes, { [field]: dto[field] });
  }
  return changes;
}

/** Where a photo lives in the bucket; never a file name (§8.5).
 *
 *  Example: `avatarKeyOf(id) // 'avatars/<id>'` */
export function avatarKeyOf(avatarId: string): string {
  return `avatars/${avatarId}`;
}

/** Where a dice texture lives in the bucket, apart from the photos.
 *
 *  Example: `diceTextureKeyOf(id) // 'dice-textures/<id>'` */
export function diceTextureKeyOf(diceTextureId: string): string {
  return `dice-textures/${diceTextureId}`;
}

/** Where a profile banner lives in the bucket, apart from the photos and the textures.
 *
 *  Example: `bannerKeyOf(id) // 'banners/<id>'` */
export function bannerKeyOf(bannerId: string): string {
  return `banners/${bannerId}`;
}
