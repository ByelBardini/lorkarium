import { z } from 'zod';
import { assetLinkDto } from '../assets/asset.dto';

/** 5 MiB: the largest photo `PUT /api/account/avatar` accepts, before decoding. */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** The photo types the server reads; an animated GIF is accepted and kept as animated WebP. */
export const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

export const avatarMimeTypeDto = z.enum(AVATAR_MIME_TYPES);

export type AvatarMimeTypeDto = z.infer<typeof avatarMimeTypeDto>;

/** Side in pixels of the stored photo: the server crops the center into a 256 × 256 square. */
export const AVATAR_SIDE = 256;

/** Body of `POST /api/account/avatar/link`: the photo from a web link (an animated GIF too).
 *
 *  Example: `avatarLinkRequestDto.parse({ url: ' https://x.com/a.gif ' }).url // 'https://x.com/a.gif'` */
export const avatarLinkRequestDto = z.strictObject({ url: assetLinkDto });

export type AvatarLinkRequestDto = z.infer<typeof avatarLinkRequestDto>;

/** Path params of `GET /api/avatars/:avatarId`. */
export const avatarParamsDto = z.strictObject({ avatarId: z.uuid() });

export type AvatarParamsDto = z.infer<typeof avatarParamsDto>;
