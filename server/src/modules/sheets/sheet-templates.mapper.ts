import {
  sheetTemplateManifestDto,
  type SheetTemplateCodeDto,
  type SheetTemplateDto,
  type SheetTemplateFilesDto,
  type SheetTemplateManifestDto,
  type SheetTemplateSummaryDto,
  type UpdateSheetTemplateRequestDto,
} from '@lorkarium/contracts';
import { planLockedOf, type PlanRank } from '../library/library.mapper';
import type {
  SheetTemplateChangesPo,
  SheetTemplateFilesPo,
  SheetTemplateManifestPo,
  SheetTemplatePo,
  SheetTemplateSummaryPo,
} from './sheet-templates.po';

/** The library row of a template, without the code; `place` (its rank among the table's
 *  templates and the owner's limits) decides `planLocked`.
 *
 *  Example: `toSheetTemplateSummaryDto(row, { rank: 1, limits: PLAN_LIMITS.free }).planLocked // true` */
export function toSheetTemplateSummaryDto(
  row: SheetTemplateSummaryPo,
  place: PlanRank,
): SheetTemplateSummaryDto {
  return {
    id: row.id,
    folderId: row.folderId,
    name: row.name,
    version: row.version,
    planLocked: planLockedOf('sheetTemplates', place),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The stored manifest read through the contract, so a list added after it was saved comes
 *  back empty instead of missing.
 *
 *  Example: `toSheetTemplateManifestDto({ permissions: [], bars: [] }).bars // []` */
export function toSheetTemplateManifestDto(
  manifest: SheetTemplateManifestPo,
): SheetTemplateManifestDto {
  return sheetTemplateManifestDto.parse(manifest);
}

/** A copy of the stored files, in their order, so no caller shares the row's list.
 *
 *  Example: `toSheetTemplateFilesDto(row.files)[0]?.path // 'index.html'` */
export function toSheetTemplateFilesDto(files: SheetTemplateFilesPo): SheetTemplateFilesDto {
  return files.map(({ path, content }) => ({ path, content }));
}

/** The template with its files and manifest, as the master's editor reads it.
 *
 *  Example: `toSheetTemplateDto(row, { rank: 0, limits }).files[0]?.path // 'index.html'` */
export function toSheetTemplateDto(row: SheetTemplatePo, place: PlanRank): SheetTemplateDto {
  const files = toSheetTemplateFilesDto(row.files);
  const manifest = toSheetTemplateManifestDto(row.manifest);
  return { ...toSheetTemplateSummaryDto(row, place), files, manifest };
}

/** The files a sheet runs and the manifest its host enforces, sent with the sheet. */
export function toSheetTemplateCodeDto(row: SheetTemplatePo): SheetTemplateCodeDto {
  const { name, version } = row;
  const files = toSheetTemplateFilesDto(row.files);
  return { name, version, files, manifest: toSheetTemplateManifestDto(row.manifest) };
}

/** Only the keys that came; the files and the manifest come whole or not at all. */
export function toSheetTemplateChangesPo(
  input: UpdateSheetTemplateRequestDto,
): SheetTemplateChangesPo {
  const { name, folderId, files, manifest } = input;
  return {
    ...(name === undefined ? {} : { name }),
    ...(folderId === undefined ? {} : { folderId }),
    ...(files === undefined ? {} : { files }),
    ...(manifest === undefined ? {} : { manifest }),
  };
}
