import type { DocumentDto, DocumentSummaryDto } from '@lorkarium/contracts';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { DocumentAccessBo } from './document-access.bo';
import type { DocumentPo } from './documents.po';
import type { DocumentSummaryPo } from './documents.dao';
import type { DocumentTabSummaryPo } from './document-tabs.po';
import { visibleTabsOf } from './document-tabs.bo';
import { toDocumentTabSummaryDto } from './document-tabs.mapper';

export function toDocumentSummary(
  row: DocumentSummaryPo,
  ownerIds: string[],
  access: CampaignAccessBo,
): DocumentSummaryDto {
  const permissions = new DocumentAccessBo(access, { ...row, ownerIds });
  return {
    id: row.id,
    name: row.name,
    folderId: row.folderId,
    visibility: row.visibility,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    canEdit: permissions.canEdit(),
    canManage: permissions.canManage(),
    ...(access.isMaster() ? { ownerIds } : {}),
  };
}
/** The opened document with only the tabs its reader may see, never their bodies.
 *
 *  Example: `toDocumentDto(row, owners, access, tabs).tabs // without "Segredos" for a player` */
export function toDocumentDto(
  row: DocumentPo,
  ownerIds: string[],
  access: CampaignAccessBo,
  tabs: readonly DocumentTabSummaryPo[],
): DocumentDto {
  const document = new DocumentAccessBo(access, { ...row, ownerIds });
  return {
    ...toDocumentSummary(row, ownerIds, access),
    schemaVersion: 2,
    tabs: visibleTabsOf(document, tabs).map(toDocumentTabSummaryDto),
  };
}
