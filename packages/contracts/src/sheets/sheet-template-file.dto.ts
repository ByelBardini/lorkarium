import { z } from 'zod';
import { utf8Length } from '../utf8-length';
import { sheetTemplateNameDto } from './sheet-template.dto';
import { sheetTemplateManifestDto } from './sheet-manifest.dto';
import {
  SHEET_TEMPLATE_ASSETS_MAX,
  SHEET_TEMPLATE_ASSETS_MAX_BYTES,
  sheetTemplateFileAssetDto,
  type SheetTemplateFileAssetDto,
} from './sheet-template-asset.dto';
import {
  checkRepeatedPaths,
  SHEET_TEMPLATE_SOURCE_MAX_BYTES,
  sheetTemplateFilesDto,
  sheetTemplateSourceTextDto,
} from './sheet-template-files.dto';

export const SHEET_TEMPLATE_FILE_FORMAT = 'lorkarium.sheet-template';
export const SHEET_TEMPLATE_FILE_VERSION = 2;
/** The first format: one html, one css and one js, still read and turned into files. */
export const SHEET_TEMPLATE_FILE_LEGACY_VERSION = 1;
export const SHEET_TEMPLATE_FILE_EXTENSION = '.lksheet';
// The JSON escape inflates the 512 KiB of code and base64 the 8 MiB of assets by a third.
export const SHEET_TEMPLATE_FILE_MAX_BYTES = 12 * 1024 * 1024;

const sheetTemplateFileFormatDto = z.literal(SHEET_TEMPLATE_FILE_FORMAT, {
  error: (issue) => `format ${JSON.stringify(issue.input)}; expected ${SHEET_TEMPLATE_FILE_FORMAT}`,
});

/** First read of a `.lksheet`: only the format and its version, loose, so a newer file is told
 *  apart from a broken one before the strict body is checked.
 *
 *  Example: `sheetTemplateFileHeaderDto.parse(JSON.parse(text)).formatVersion > SHEET_TEMPLATE_FILE_VERSION` */
export const sheetTemplateFileHeaderDto = z.object({
  format: sheetTemplateFileFormatDto,
  formatVersion: z.int().min(1),
});
export type SheetTemplateFileHeaderDto = z.infer<typeof sheetTemplateFileHeaderDto>;

interface LegacySource {
  html: string;
  css: string;
  js: string;
}

function checkLegacySourceBudget(source: LegacySource, context: z.RefinementCtx): void {
  const bytes = utf8Length(source.html) + utf8Length(source.css) + utf8Length(source.js);
  if (bytes <= SHEET_TEMPLATE_SOURCE_MAX_BYTES) return;
  context.addIssue({
    code: 'custom',
    message: `html + css + js have ${bytes} bytes; expected at most ${SHEET_TEMPLATE_SOURCE_MAX_BYTES}`,
  });
}

function formatVersionDto<V extends number>(version: V): z.ZodLiteral<V> {
  return z.literal(version, {
    error: (issue) => `formatVersion ${JSON.stringify(issue.input)}; expected ${version}`,
  });
}

/** A `.lksheet` of the first format (one html, css and js), read so an old export still imports.
 *
 *  Example: `sheetTemplateFileV1Dto.parse({ format: SHEET_TEMPLATE_FILE_FORMAT, formatVersion: 1, name, html, css, js })` */
export const sheetTemplateFileV1Dto = z
  .strictObject({
    format: sheetTemplateFileFormatDto,
    formatVersion: formatVersionDto(SHEET_TEMPLATE_FILE_LEGACY_VERSION),
    exportedAt: z.iso.datetime().optional(),
    name: sheetTemplateNameDto,
    html: sheetTemplateSourceTextDto,
    css: sheetTemplateSourceTextDto,
    js: sheetTemplateSourceTextDto,
    // A file exported before templates had a manifest declares nothing.
    manifest: sheetTemplateManifestDto.prefault({}),
  })
  .superRefine(checkLegacySourceBudget);
export type SheetTemplateFileV1Dto = z.infer<typeof sheetTemplateFileV1Dto>;

// base64 holds 3 bytes in every 4 characters, less one per `=` of padding.
function decodedBytesOf(data: string): number {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return (data.length / 4) * 3 - padding;
}

function checkFileAssets(assets: readonly SheetTemplateFileAssetDto[], context: z.RefinementCtx) {
  checkRepeatedPaths(assets, context, 'asset');
  const bytes = assets.reduce((sum, asset) => sum + decodedBytesOf(asset.data), 0);
  if (bytes <= SHEET_TEMPLATE_ASSETS_MAX_BYTES) return;
  context.addIssue({
    code: 'custom',
    message: `assets have ${bytes} bytes; expected at most ${SHEET_TEMPLATE_ASSETS_MAX_BYTES}`,
  });
}

/** A `.lksheet` file: the name, files and manifest of one template and the bytes of its assets
 *  (the manifest's own asset ids belong to the table that exported it and are left out), never
 *  its sheets, values or version.
 *
 *  Example: `sheetTemplateFileDto.parse({ format: SHEET_TEMPLATE_FILE_FORMAT, formatVersion: 2, name, files, manifest, assets })` */
export const sheetTemplateFileDto = z.strictObject({
  format: sheetTemplateFileFormatDto,
  formatVersion: formatVersionDto(SHEET_TEMPLATE_FILE_VERSION),
  exportedAt: z.iso.datetime().optional(),
  name: sheetTemplateNameDto,
  files: sheetTemplateFilesDto,
  manifest: sheetTemplateManifestDto.prefault({}),
  assets: z
    .array(sheetTemplateFileAssetDto)
    .max(SHEET_TEMPLATE_ASSETS_MAX)
    .superRefine(checkFileAssets)
    .default([]),
});
export type SheetTemplateFileDto = z.infer<typeof sheetTemplateFileDto>;
