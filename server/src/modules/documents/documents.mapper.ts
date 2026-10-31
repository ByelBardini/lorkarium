import type { DocumentDto, DocumentSummaryDto } from '@lorkarium/contracts';
import { documentContentDto } from '@lorkarium/contracts';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { DocumentAccessBo } from './document-access.bo';
import type { DocumentPo } from './documents.po';
import type { DocumentSummaryPo } from './documents.dao';

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
export function toDocumentDto(
  row: DocumentPo,
  ownerIds: string[],
  access: CampaignAccessBo,
): DocumentDto {
  return {
    ...toDocumentSummary(row, ownerIds, access),
    schemaVersion: 1,
    content: documentContentDto.parse(row.content),
  };
}
