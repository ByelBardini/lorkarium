import { z } from 'zod';

/** 20 MiB: the largest file `POST /assets` (and a link import) accepts, before decoding. */
export const ASSET_MAX_BYTES = 20 * 1024 * 1024;

/** The only image types the server keeps; GIF and SVG are refused (§8.5). */
export const ASSET_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export const ASSET_URL_MAX_LENGTH = 2048;

export const assetMimeTypeDto = z.enum(ASSET_MIME_TYPES);

export type AssetMimeTypeDto = z.infer<typeof assetMimeTypeDto>;

/** Only decides the largest side the server keeps; the asset may be used for anything later. */
export const assetPurposeDto = z.enum(['background', 'token']);

export type AssetPurposeDto = z.infer<typeof assetPurposeDto>;

/** Largest side in pixels kept per purpose; 4096 is the safe texture ceiling even on phones. */
export const ASSET_MAX_SIDE: Readonly<Record<AssetPurposeDto, number>> = {
  background: 4096,
  token: 1024,
};

/** A stored image of one campaign, as the client sees it (read back at `GET /api/assets/:id`).
 *
 *  Example: `assetDto.parse(body.asset).width // 1400` */
export const assetDto = z.strictObject({
  id: z.uuid(),
  mimeType: assetMimeTypeDto,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export type AssetDto = z.infer<typeof assetDto>;

/** Response of both `POST /api/campaigns/:campaignId/assets` routes. */
export const assetResponseDto = z.strictObject({ asset: assetDto });

export type AssetResponseDto = z.infer<typeof assetResponseDto>;

/** Query of `POST /api/campaigns/:campaignId/assets` (the body is the raw file). */
export const uploadAssetQueryDto = z.strictObject({ purpose: assetPurposeDto });

export type UploadAssetQueryDto = z.infer<typeof uploadAssetQueryDto>;

const ALLOWED_LINK_SCHEMES = new Set(['http:', 'https:']);
const LINK_SCHEME = /^([a-z][a-z\d+.-]*:)/i;
const WEB_LINK = /^https?:\/\/[^\s/?#]+/i;

/** A web link to an image (http or https), trimmed; shared by the table images and the photo. */
export const assetLinkDto = z
  .string()
  .trim()
  .max(ASSET_URL_MAX_LENGTH, `Link is longer than ${ASSET_URL_MAX_LENGTH} characters.`)
  .superRefine((value, context) => {
    const scheme = LINK_SCHEME.exec(value)?.[1]?.toLowerCase();
    if (scheme !== undefined && !ALLOWED_LINK_SCHEMES.has(scheme)) {
      context.addIssue({
        code: 'custom',
        message: `Link scheme "${scheme}" is not allowed: expected http or https.`,
      });
      return;
    }
    if (WEB_LINK.test(value)) return;
    context.addIssue({ code: 'custom', message: `"${value.slice(0, 80)}" is not a link.` });
  });

/** Body of `POST /api/campaigns/:campaignId/assets/import`: the server downloads the link itself.
 *
 *  Example: `importAssetRequestDto.parse({ url: ' https://x.com/a.png ', purpose: 'token' }).url // 'https://x.com/a.png'` */
export const importAssetRequestDto = z.strictObject({
  url: assetLinkDto,
  purpose: assetPurposeDto,
});

export type ImportAssetRequestDto = z.infer<typeof importAssetRequestDto>;

/** Path params of `GET /api/assets/:assetId`. */
export const assetIdParamsDto = z.strictObject({ assetId: z.uuid() });

export type AssetIdParamsDto = z.infer<typeof assetIdParamsDto>;
