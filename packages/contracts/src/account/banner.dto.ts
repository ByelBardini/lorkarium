import { z } from 'zod';
import { imageCropQueryDto } from '../assets/asset.dto';
import { avatarLinkRequestDto } from './avatar.dto';

/** Size in pixels of the stored profile banner: the server cuts the 3:1 rectangle (or the center)
 *  into an 1800 × 600 WebP, animated when a GIF is sent on a paid plan. Input limit and types are
 *  the photo's. */
export const BANNER_WIDTH = 1800;
export const BANNER_HEIGHT = 600;

/** Body of `POST /api/account/banner/link`: the same `{ url }` as the photo's link. */
export const bannerLinkRequestDto = avatarLinkRequestDto;

export type BannerLinkRequestDto = z.infer<typeof bannerLinkRequestDto>;

/** Query of `PUT /api/account/banner` (the body is the raw file): the 3:1 rectangle picked in the
 *  crop dialog, in percent of the upright image; none = the center. */
export const bannerUploadQueryDto = imageCropQueryDto;

export type BannerUploadQueryDto = z.infer<typeof bannerUploadQueryDto>;

/** Path params of `GET /api/banners/:bannerId`. */
export const bannerParamsDto = z.strictObject({ bannerId: z.uuid() });

export type BannerParamsDto = z.infer<typeof bannerParamsDto>;
