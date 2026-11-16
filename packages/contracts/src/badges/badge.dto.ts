import { z } from 'zod';
import { imageCropQueryDto } from '../assets/asset.dto';

export const BADGE_NAME_MAX_LENGTH = 40;
export const BADGE_DESCRIPTION_MAX_LENGTH = 200;
/** Side in pixels of the stored badge image: a static 1:1 WebP with transparency. */
export const BADGE_IMAGE_SIDE = 128;
/** Largest file accepted by `PUT /api/admin/badges/:badgeId/image`, checked before decoding. */
export const BADGE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
// Bounds the id lists at the edge; far above any catalog an admin keeps by hand.
const BADGE_ID_LIST_MAX = 500;

function trimmedTextDto(field: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, {
      error: (issue) =>
        `Badge ${field} "${String(issue.input)}" is empty: expected 1 to ${max} characters.`,
    })
    .max(max, {
      error: (issue) =>
        `Badge ${field} "${String(issue.input)}" is too long: expected 1 to ${max} characters.`,
    });
}

/** The badge name: trimmed, 1 to 40 characters; unique in the catalog regardless of case. */
export const badgeNameDto = trimmedTextDto('name', BADGE_NAME_MAX_LENGTH);

/** The badge description shown in the tooltip: trimmed, 1 to 200 characters. */
export const badgeDescriptionDto = trimmedTextDto('description', BADGE_DESCRIPTION_MAX_LENGTH);

/** A badge as everyone sees it on a card: only badges with an image leave the backoffice.
 *
 *  Example: `badgeDto.parse(body.card.badges[0]).imageId` */
export const badgeDto = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  imageId: z.uuid(),
});
export type BadgeDto = z.infer<typeof badgeDto>;

/** A catalog row in the backoffice: may lack an image; `holders` counts the accounts that have it.
 *
 *  Example: `adminBadgeDto.parse(row).holders // 12` */
export const adminBadgeDto = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  imageId: z.uuid().nullable(),
  position: z.int().nonnegative(),
  holders: z.int().nonnegative(),
});
export type AdminBadgeDto = z.infer<typeof adminBadgeDto>;

/** Body of `POST /api/admin/badges`; strict, so a `position` is refused (new ones go last). */
export const createBadgeRequestDto = z.strictObject({
  name: badgeNameDto,
  description: badgeDescriptionDto,
});
export type CreateBadgeRequestDto = z.infer<typeof createBadgeRequestDto>;

/** Body of `PATCH /api/admin/badges/:badgeId`: at least one of the two texts. */
export const updateBadgeRequestDto = z
  .strictObject({ name: badgeNameDto.optional(), description: badgeDescriptionDto.optional() })
  .refine((body) => body.name !== undefined || body.description !== undefined, {
    error: 'Badge update is empty: expected name and/or description.',
  });
export type UpdateBadgeRequestDto = z.infer<typeof updateBadgeRequestDto>;

const uniqueBadgeIdsDto = z
  .array(z.uuid())
  .max(BADGE_ID_LIST_MAX)
  .superRefine((ids, context) => {
    const repeated = ids.find((id, index) => ids.indexOf(id) !== index);
    if (repeated === undefined) return;
    context.addIssue({
      code: 'custom',
      message: `Badge id "${repeated}" is repeated: expected each id once.`,
    });
  });

/** Body of `PUT /api/admin/badges/order`: every catalog id, once, in the new order. */
export const badgeOrderRequestDto = z.strictObject({ badgeIds: uniqueBadgeIdsDto });
export type BadgeOrderRequestDto = z.infer<typeof badgeOrderRequestDto>;

/** Body of `PUT /api/admin/users/:userId/badges`: the full set the account keeps (`[]` = none). */
export const userBadgesRequestDto = z.strictObject({ badgeIds: uniqueBadgeIdsDto });
export type UserBadgesRequestDto = z.infer<typeof userBadgesRequestDto>;

/** Path params of the routes about one catalog badge. */
export const badgeParamsDto = z.strictObject({ badgeId: z.uuid() });
export type BadgeParamsDto = z.infer<typeof badgeParamsDto>;

/** Path params of `GET /api/badge-images/:imageId`. */
export const badgeImageParamsDto = z.strictObject({ imageId: z.uuid() });
export type BadgeImageParamsDto = z.infer<typeof badgeImageParamsDto>;

/** Query of `PUT /api/admin/badges/:badgeId/image` (the body is the raw file): the 1:1 rectangle. */
export const badgeImageUploadQueryDto = imageCropQueryDto;
export type BadgeImageUploadQueryDto = z.infer<typeof badgeImageUploadQueryDto>;

/** Response of `GET /api/admin/badges` and `PUT /api/admin/badges/order`, in catalog order. */
export const adminBadgesResponseDto = z.strictObject({ badges: z.array(adminBadgeDto) });
export type AdminBadgesResponseDto = z.infer<typeof adminBadgesResponseDto>;

/** Response of the routes that write one catalog badge. */
export const adminBadgeResponseDto = z.strictObject({ badge: adminBadgeDto });
export type AdminBadgeResponseDto = z.infer<typeof adminBadgeResponseDto>;

/** Response of `PUT /api/admin/users/:userId/badges`: the account's badges, in catalog order. */
export const userBadgesResponseDto = z.strictObject({ badges: z.array(badgeDto) });
export type UserBadgesResponseDto = z.infer<typeof userBadgesResponseDto>;

/** Response of `GET /api/admin/users/:userId/badges`: the granted ids, image or not. */
export const userBadgeIdsResponseDto = z.strictObject({ badgeIds: z.array(z.uuid()) });
export type UserBadgeIdsResponseDto = z.infer<typeof userBadgeIdsResponseDto>;
