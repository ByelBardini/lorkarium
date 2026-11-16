import {
  BADGE_IMAGE_SIDE,
  type AdminBadgeDto,
  type BadgeDto,
  type UpdateBadgeRequestDto,
} from '@lorkarium/contracts';
import type { ImageShape } from '../profiles/avatar-processor.port';
import type { CatalogEntry } from './badges.bo';
import type { BadgeCatalogRow, BadgeTexts, LockedBadgeRow } from './badges.dao';
import type { BadgePo } from './badges.po';

/** A still 128 square: the crop rectangle of the send is added to it. */
export const BADGE_IMAGE_SHAPE: ImageShape = {
  width: BADGE_IMAGE_SIDE,
  height: BADGE_IMAGE_SIDE,
  animated: false,
};

export const BADGE_IMAGE_CONTENT_TYPE = 'image/webp';

/** Example: `badgeImageKeyOf(imageId) // 'badges/<imageId>'` */
export function badgeImageKeyOf(imageId: string): string {
  return `badges/${imageId}`;
}

/** Example: `toAdminBadgeDto(row).holders // 3` */
export function toAdminBadgeDto(row: BadgeCatalogRow): AdminBadgeDto {
  const { id, name, description, imageId, position, holders } = row;
  return { id, name, description, imageId, position, holders };
}

/** Only the badges with an image leave the backoffice; the order is kept.
 *
 *  Example: `shownBadgesOf(await dao.badgesOfAccount(biaId))` */
export function shownBadgesOf(rows: readonly BadgePo[]): BadgeDto[] {
  return rows.flatMap(({ id, name, description, imageId }) =>
    imageId === null ? [] : [{ id, name, description, imageId }],
  );
}

/** Example: `grantVerdict(toCatalogEntries(await dao.lockCatalog()), ids)` */
export function toCatalogEntries(rows: readonly LockedBadgeRow[]): CatalogEntry[] {
  return rows.map((row) => ({ id: row.id, hasImage: row.imageId !== null }));
}

/** Only the texts that came: an absent key keeps the stored one.
 *
 *  Example: `toBadgeChanges({ name: 'Lenda' }) // { name: 'Lenda' }` */
export function toBadgeChanges(dto: UpdateBadgeRequestDto): Partial<BadgeTexts> {
  return {
    ...(dto.name === undefined ? {} : { name: dto.name }),
    ...(dto.description === undefined ? {} : { description: dto.description }),
  };
}
