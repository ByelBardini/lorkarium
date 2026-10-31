import {
  documentContentDto,
  type DocumentTabDto,
  type DocumentTabSummaryDto,
} from '@lorkarium/contracts';
import type { DocumentTabPo, DocumentTabSummaryPo } from './document-tabs.po';

/** The tab as the strip lists it: no body, the version is the tab's own.
 *
 *  Example: `toDocumentTabSummaryDto(row) // { id, name, visibility, version, updatedAt }` */
export function toDocumentTabSummaryDto(row: DocumentTabSummaryPo): DocumentTabSummaryDto {
  return {
    id: row.id,
    name: row.name,
    visibility: row.visibility,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}
/** The opened tab with its canonical body; the stored JSON is parsed again on the way out.
 *
 *  Example: `toDocumentTabDto(row).content // { type: 'doc', content: [...] }` */
export function toDocumentTabDto(row: DocumentTabPo): DocumentTabDto {
  return {
    ...toDocumentTabSummaryDto(row),
    schemaVersion: 1,
    content: documentContentDto.parse(row.content),
  };
}
