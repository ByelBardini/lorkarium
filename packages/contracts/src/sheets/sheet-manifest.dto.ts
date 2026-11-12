import { z } from 'zod';
import { hexColorDto } from '../color/hex-color.dto';
import {
  BAR_LABEL_MAX_LENGTH,
  BAR_PALETTE,
  BAR_VALUE_LIMIT,
  MAX_BARS_PER_TOKEN,
} from '../board/token.dto';
import { SHEET_TEMPLATE_ASSETS_MAX, sheetManifestAssetDto } from './sheet-template-asset.dto';

/** What a template may ask the table for beyond values, bars and dice (which every sheet has):
 *  `character:stats` writes AC and DC, `character:portrait` swaps the portrait, `sheet:images`
 *  uploads images to the sheet, `documents:read` reads the public documents of the table,
 *  `character:bars` creates on the holder a bar it does not have yet. */
export const SHEET_MANIFEST_PERMISSIONS = [
  'character:stats',
  'character:portrait',
  'sheet:images',
  'documents:read',
  'character:bars',
] as const;

const permissionList = SHEET_MANIFEST_PERMISSIONS.join(', ');

/** One permission a template declares.
 *
 *  Example: `sheetManifestPermissionDto.parse('character:stats')` */
export const sheetManifestPermissionDto = z.enum(SHEET_MANIFEST_PERMISSIONS, {
  error: (issue) => `permission ${JSON.stringify(issue.input)}; expected one of ${permissionList}`,
});
export type SheetManifestPermissionDto = z.infer<typeof sheetManifestPermissionDto>;

const paletteList = BAR_PALETTE.join(', ');

/** A bar the template expects its holder to have; its color a palette name (drawn in each
 *  table's tones) or a custom hex, as a token bar takes.
 *
 *  Example: `sheetManifestBarDto.parse({ label: 'Essência', color: '#ffffff', max: 15 })` */
export const sheetManifestBarDto = z.strictObject({
  label: z.string().trim().min(1).max(BAR_LABEL_MAX_LENGTH),
  color: z.union([z.enum(BAR_PALETTE), hexColorDto], {
    error: (issue) =>
      `bar color ${JSON.stringify(issue.input)}; expected one of ${paletteList} or a hex #rrggbb`,
  }),
  max: z.int().min(1).max(BAR_VALUE_LIMIT),
});
export type SheetManifestBarDto = z.infer<typeof sheetManifestBarDto>;

// The same key as the bridge resolves a bar by: "HP" and " hp " are one bar.
function barLabelKey(label: string): string {
  return label.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
}

type ManifestLists = Readonly<{
  permissions: readonly string[];
  bars: readonly Readonly<{ label: string }>[];
  assets: readonly Readonly<{ path: string }>[];
}>;

function checkRepeatedPermissions(permissions: readonly string[], context: z.RefinementCtx): void {
  const repeated = permissions.find((permission, index) => permissions.indexOf(permission) < index);
  if (repeated === undefined) return;
  context.addIssue({
    code: 'custom',
    path: ['permissions'],
    message: `permission "${repeated}" repeats; expected each permission once`,
  });
}

function checkRepeatedBarLabels(
  bars: readonly Readonly<{ label: string }>[],
  context: z.RefinementCtx,
): void {
  const keys = bars.map(({ label }) => barLabelKey(label));
  const second = keys.findIndex((key, index) => keys.indexOf(key) < index);
  if (second === -1) return;
  const first = bars[keys.indexOf(keys[second] as string)]?.label;
  context.addIssue({
    code: 'custom',
    path: ['bars'],
    message: `bar labels "${first}" and "${bars[second]?.label}" repeat; expected distinct labels, ignoring case and accents`,
  });
}

// Paths are told apart ignoring case, as the template files are.
function checkRepeatedAssetPaths(
  assets: readonly Readonly<{ path: string }>[],
  context: z.RefinementCtx,
): void {
  const keys = assets.map(({ path }) => path.toLowerCase());
  const second = keys.findIndex((key, index) => keys.indexOf(key) < index);
  if (second === -1) return;
  context.addIssue({
    code: 'custom',
    path: ['assets'],
    message: `asset path "${assets[second]?.path}" repeats; expected distinct paths, ignoring case`,
  });
}

function checkManifestLists(manifest: ManifestLists, context: z.RefinementCtx): void {
  checkRepeatedPermissions(manifest.permissions, context);
  checkRepeatedBarLabels(manifest.bars, context);
  checkRepeatedAssetPaths(manifest.assets, context);
}

/** What a template declares: the permissions the host grants it, the bars its holder should
 *  have and the assets (fonts, images) its CSS and HTML name by `asset:`. Each list defaults to
 *  empty, so a stored manifest from before a list existed still reads.
 *
 *  Example: `sheetTemplateManifestDto.parse({ permissions: ['character:stats'], bars: [{ label: 'HP', color: 'ember', max: 12 }] })` */
export const sheetTemplateManifestDto = z
  .strictObject({
    permissions: z.array(sheetManifestPermissionDto).default([]),
    bars: z
      .array(sheetManifestBarDto)
      .max(MAX_BARS_PER_TOKEN, {
        error: (issue) =>
          `bars has ${Array.isArray(issue.input) ? issue.input.length : '?'}; expected at most ${MAX_BARS_PER_TOKEN}`,
      })
      .default([]),
    assets: z
      .array(sheetManifestAssetDto)
      .max(SHEET_TEMPLATE_ASSETS_MAX, {
        error: (issue) =>
          `assets has ${Array.isArray(issue.input) ? issue.input.length : '?'}; expected at most ${SHEET_TEMPLATE_ASSETS_MAX}`,
      })
      .default([]),
  })
  .superRefine(checkManifestLists);
export type SheetTemplateManifestDto = z.infer<typeof sheetTemplateManifestDto>;

/** The manifest of a template that declares nothing (the stored default); a new object each
 *  call, so no caller shares the lists.
 *
 *  Example: `createSheetTemplateRequestDto.parse(body).manifest ?? emptySheetTemplateManifest()` */
export function emptySheetTemplateManifest(): SheetTemplateManifestDto {
  return { permissions: [], bars: [], assets: [] };
}
