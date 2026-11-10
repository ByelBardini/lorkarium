import { z } from 'zod';
import {
  isPlainTemplatePath,
  SHEET_TEMPLATE_FILE_PATH_MAX_LENGTH,
} from './sheet-template-files.dto';

/** The types a template asset is kept as: the still images of the table and WOFF2 fonts. */
export const SHEET_TEMPLATE_ASSET_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'font/woff2',
] as const;
export const SHEET_TEMPLATE_FONT_MIME_TYPE = 'font/woff2';
/** 2 MiB: the largest font a template keeps. */
export const SHEET_TEMPLATE_FONT_MAX_BYTES = 2 * 1024 * 1024;
/** 8 MiB: every asset of one template together (each image counted after it was normalized). */
export const SHEET_TEMPLATE_ASSETS_MAX_BYTES = 8 * 1024 * 1024;
export const SHEET_TEMPLATE_ASSETS_MAX = 32;

export const sheetTemplateAssetMimeTypeDto = z.enum(SHEET_TEMPLATE_ASSET_MIME_TYPES, {
  error: (issue) =>
    `asset type ${JSON.stringify(issue.input)}; expected one of ${SHEET_TEMPLATE_ASSET_MIME_TYPES.join(', ')}`,
});
export type SheetTemplateAssetMimeTypeDto = z.infer<typeof sheetTemplateAssetMimeTypeDto>;

const ASSET_EXTENSION = /\.(woff2|png|jpe?g|webp)$/;

/** The path the template's CSS and HTML name an asset by (`url("asset:fontes/x.woff2")`).
 *
 *  Example: `sheetTemplateAssetPathDto.parse('fontes/cormorant.woff2')` */
export const sheetTemplateAssetPathDto = z
  .string()
  .refine((path) => isPlainTemplatePath(path, ASSET_EXTENSION), {
    error: (issue) =>
      `asset path ${JSON.stringify(issue.input)}; expected plain segments (letters, digits, _, - and .) joined by /, at most ${SHEET_TEMPLATE_FILE_PATH_MAX_LENGTH} characters, ending in .woff2, .png, .jpg, .jpeg or .webp`,
  });

/** One asset the manifest declares: its path in the template and the stored asset.
 *
 *  Example: `sheetManifestAssetDto.parse({ path: 'fontes/x.woff2', assetId })` */
export const sheetManifestAssetDto = z.strictObject({
  path: sheetTemplateAssetPathDto,
  assetId: z.uuid(),
});
export type SheetManifestAssetDto = z.infer<typeof sheetManifestAssetDto>;

/** A template asset as the master's upload answers it: no pixels for a font, so the size only.
 *
 *  Example: `sheetTemplateAssetDto.parse({ id, mimeType: 'font/woff2', sizeBytes: 41_220 })` */
export const sheetTemplateAssetDto = z.strictObject({
  id: z.uuid(),
  mimeType: sheetTemplateAssetMimeTypeDto,
  sizeBytes: z.int().positive(),
});
export type SheetTemplateAssetDto = z.infer<typeof sheetTemplateAssetDto>;

/** Answer of `POST /campaigns/:campaignId/sheet-template-assets`. */
export const sheetTemplateAssetResponseDto = z.strictObject({ asset: sheetTemplateAssetDto });
export type SheetTemplateAssetResponseDto = z.infer<typeof sheetTemplateAssetResponseDto>;

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** One asset inside a `.lksheet`: its path, type and bytes as base64 (no id: the importing table
 *  stores it again).
 *
 *  Example: `sheetTemplateFileAssetDto.parse({ path: 'img/a.png', type: 'image/png', data: 'iVBORw0K' })` */
export const sheetTemplateFileAssetDto = z.strictObject({
  path: sheetTemplateAssetPathDto,
  type: sheetTemplateAssetMimeTypeDto,
  data: z
    .string()
    .min(1)
    .refine((data) => data.length % 4 === 0 && BASE64.test(data), {
      error: 'asset data is not base64; expected the bytes as standard base64',
    }),
});
export type SheetTemplateFileAssetDto = z.infer<typeof sheetTemplateFileAssetDto>;
