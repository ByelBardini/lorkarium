import type { DocumentDto, DocumentSummaryDto, PlanLimits } from '@lorkarium/contracts';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { DocumentAccessBo } from './document-access.bo';
import type { DocumentPo } from './documents.po';
import type { DocumentSummaryPo } from './documents.dao';
import type { DocumentTabRankedPo } from './document-tabs.dao';
import { isTabPlanLocked, visibleTabsOf } from './document-tabs.bo';
import { toDocumentTabSummaryDto } from './document-tabs.mapper';

export function toDocumentSummary(
  row: DocumentSummaryPo,
  ownerIds: string[],
  access: CampaignAccessBo,
): DocumentSummaryDto {
  // Only what the reader may do: whether they read it at all was decided before getting here.
  const permissions = new DocumentAccessBo(access, { ...row, ownerIds, hiddenByFolder: false });
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
    preview: { summary: row.previewSummary, imageAssetId: row.previewAssetId },
  };
}
/** The opened document with only the tabs its reader may see, never their bodies; each tab is
 *  `planLocked` by its rank against `limits`, the owner's plan.
 *
 *  Example: `toDocumentDto(row, owners, access, tabs, limits).tabs // without "Segredos" for a player` */
export function toDocumentDto(
  row: DocumentPo,
  ownerIds: string[],
  access: CampaignAccessBo,
  tabs: readonly DocumentTabRankedPo[],
  limits: PlanLimits,
): DocumentDto {
  const document = new DocumentAccessBo(access, { ...row, ownerIds, hiddenByFolder: false });
  return {
    ...toDocumentSummary(row, ownerIds, access),
    schemaVersion: 2,
    tabs: visibleTabsOf(document, tabs).map((tab) =>
      toDocumentTabSummaryDto(tab, isTabPlanLocked(tab.rank, limits)),
    ),
  };
}
