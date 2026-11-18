import {
  documentContentDto,
  type DocumentTabDto,
  type DocumentTabSummaryDto,
} from '@lorkarium/contracts';
import type { DocumentTabPo, DocumentTabSummaryPo } from './document-tabs.po';

/** The tab as the strip lists it: no body, the version is the tab's own; `planLocked` says the
 *  owner's plan keeps its name and body read only (`isTabPlanLocked`).
 *
 *  Example: `toDocumentTabSummaryDto(row, false) // { id, name, visibility, version, updatedAt, planLocked }` */
export function toDocumentTabSummaryDto(
  row: DocumentTabSummaryPo,
  planLocked: boolean,
): DocumentTabSummaryDto {
  return {
    id: row.id,
    name: row.name,
    visibility: row.visibility,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    planLocked,
  };
}
/** The opened tab with its canonical body; the stored JSON is parsed again on the way out.
 *
 *  Example: `toDocumentTabDto(row, false).content // { type: 'doc', content: [...] }` */
export function toDocumentTabDto(row: DocumentTabPo, planLocked: boolean): DocumentTabDto {
  return {
    ...toDocumentTabSummaryDto(row, planLocked),
    schemaVersion: 1,
    content: documentContentDto.parse(row.content),
  };
}
