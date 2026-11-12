import { z } from 'zod';

/** 20 MiB: the largest file `POST /assets` (and a link import) accepts, before decoding. */
export const ASSET_MAX_BYTES = 20 * 1024 * 1024;

/** The only image types the server keeps; SVG is refused (§8.5) and GIF is kept only for an aura,
 *  the one purpose that animates. */
export const ASSET_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

export const ASSET_URL_MAX_LENGTH = 2048;

export const assetMimeTypeDto = z.enum(ASSET_MIME_TYPES);

export type AssetMimeTypeDto = z.infer<typeof assetMimeTypeDto>;

/** Only decides the largest side the server keeps; the asset may be used for anything later. */
export const assetPurposeDto = z.enum([
  'background',
  'token',
  'cover',
  'campaign_photo',
  'campaign_banner',
  'condition',
  'aura',
  'library_image',
  'library_map',
  'document_image',
  'sheet_image',
  'sheet_template_asset',
]);

export type AssetPurposeDto = z.infer<typeof assetPurposeDto>;

/** Largest side in pixels kept per purpose; 4096 is the safe texture ceiling even on phones. */
export const ASSET_MAX_SIDE: Readonly<Record<AssetPurposeDto, number>> = {
  background: 4096,
  library_image: 4096,
  document_image: 4096,
  sheet_image: 4096,
  sheet_template_asset: 4096,
  // A map is made to be zoomed into and is drawn as a plain image, never uploaded as a texture.
  library_map: 8192,
  token: 1024,
  // The cover is at most a wide card or the detail banner; 1600 keeps it sharp on 2x screens.
  cover: 1600,
  // The photo is at most a 256 px square on a 2x screen; the banner a full-width 3:1 strip.
  campaign_photo: 512,
  campaign_banner: 1800,
  // The condition badge reaches ~120 px on screen at high zoom (240 px on 2x screens); a square
  // 256 keeps it sharp at 1/16 of the texture memory of a token.
  condition: 256,
  // An aura spans a few cells around the token; 512 stays sharp and keeps a GIF's frames small.
  aura: 512,
};

/** The purposes the server cuts to a fixed aspect: the three images of a campaign. */
export type FramedAssetPurposeDto = Extract<
  AssetPurposeDto,
  'campaign_photo' | 'cover' | 'campaign_banner'
>;

/** An aspect ratio as `width:height` (2:1 = `{ width: 2, height: 1 }`). */
export interface AssetFrameAspect {
  readonly width: number;
  readonly height: number;
}

/** The aspect each campaign image is kept in, so no screen has to crop it again.
 *
 *  Example: `ASSET_FRAME.campaign_banner.width // 3` */
export const ASSET_FRAME: Readonly<Record<FramedAssetPurposeDto, Readonly<AssetFrameAspect>>> =
  Object.freeze({
    campaign_photo: Object.freeze({ width: 1, height: 1 }),
    cover: Object.freeze({ width: 2, height: 1 }),
    campaign_banner: Object.freeze({ width: 3, height: 1 }),
  });

/** How much animation an aura GIF may keep: its frames and the pixels they decode to in total
 *  (width × height × frames), so a 120-frame GIF is cut to a smaller side, never refused for it. */
export const AURA_ANIMATION_LIMITS = Object.freeze({
  maxFrames: 120,
  maxDecodedPixels: 16_000_000,
});

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

const CROP_KEYS = ['cropX', 'cropY', 'cropW', 'cropH'] as const;
// react-easy-crop reports float percents; x + w may pass 100 by a rounding error, never more.
const CROP_EDGE_TOLERANCE = 1e-6;

const cropOffsetDto = z.coerce.number().min(0).max(100);
const cropSizeDto = z.coerce.number().gt(0).max(100);

interface UploadCropFields {
  cropX?: number | undefined;
  cropY?: number | undefined;
  cropW?: number | undefined;
  cropH?: number | undefined;
}

function refineCropRectangle(query: UploadCropFields, context: z.RefinementCtx): void {
  const { cropX, cropY, cropW, cropH } = query;
  if (cropX !== undefined && cropY !== undefined && cropW !== undefined && cropH !== undefined) {
    refineCropEdge(cropX + cropW, 'cropX + cropW', 'cropW', context);
    refineCropEdge(cropY + cropH, 'cropY + cropH', 'cropH', context);
    return;
  }
  const received = CROP_KEYS.filter((key) => query[key] !== undefined);
  if (received.length === 0) return;
  context.addIssue({
    code: 'custom',
    message: `Crop rectangle has only ${received.join(', ')}: expected cropX, cropY, cropW and cropH together, or none.`,
  });
}

function refineCropEdge(sum: number, label: string, path: string, context: z.RefinementCtx): void {
  if (sum <= 100 + CROP_EDGE_TOLERANCE) return;
  context.addIssue({
    code: 'custom',
    path: [path],
    message: `Crop ${label} is ${sum}: expected at most 100 (the rectangle leaves the image).`,
  });
}

/** Query of `POST /api/campaigns/:campaignId/assets` (the body is the raw file). The optional
 *  crop is a rectangle in percent (0..100) of the upright image, all four fields or none.
 *
 *  Example: `uploadAssetQueryDto.parse({ purpose: 'campaign_photo', cropX: '10', cropY: '0', cropW: '50', cropH: '100' }).cropW // 50` */
export const uploadAssetQueryDto = z
  .strictObject({
    purpose: assetPurposeDto,
    cropX: cropOffsetDto.optional(),
    cropY: cropOffsetDto.optional(),
    cropW: cropSizeDto.optional(),
    cropH: cropSizeDto.optional(),
  })
  // A field already out of range would also fail the edge sum: report it once, on its own path.
  .superRefine(refineCropRectangle, { when: (payload) => payload.issues.length === 0 });

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

// Repeats the game-core's limits (`SIGHT_OUTLINE_*`): contracts depends only on zod.
const OUTLINE_VERTICES_MAX = 48;
const OUTLINE_ISLANDS_MAX = 4;
const OUTLINE_POLYGON_POINTS_MIN = 3;

const outlineCoordinateDto = z.number().min(0).max(1);
const outlinePointDto = z.tuple([outlineCoordinateDto, outlineCoordinateDto]).readonly();
const outlinePolygonDto = z.array(outlinePointDto).min(OUTLINE_POLYGON_POINTS_MIN).readonly();

/** The silhouette of a token image: up to 4 polygons of `[x, y]` in a unit square (0 to 1), 48
 *  vertices at most in total. An empty list = a fully transparent image.
 *
 *  Example: `sightOutlineDto.parse([[[0.5, 0], [1, 1], [0, 1]]]) // one triangle` */
export const sightOutlineDto = z
  .array(outlinePolygonDto)
  .max(OUTLINE_ISLANDS_MAX)
  .superRefine((polygons, context) => {
    const vertices = polygons.reduce((total, polygon) => total + polygon.length, 0);
    if (vertices <= OUTLINE_VERTICES_MAX) return;
    context.addIssue({
      code: 'custom',
      message: `Outline has ${vertices} vertices: expected at most ${OUTLINE_VERTICES_MAX}.`,
    });
  })
  .readonly();

export type SightOutlineDto = z.infer<typeof sightOutlineDto>;

/** Response of `GET /api/assets/:assetId/outline`; `null` = the image has no outline (sent before
 *  the feature, or not a token image).
 *
 *  Example: `assetOutlineResponseDto.parse(body).outline?.length // 1` */
export const assetOutlineResponseDto = z.strictObject({ outline: sightOutlineDto.nullable() });

export type AssetOutlineResponseDto = z.infer<typeof assetOutlineResponseDto>;
