import { z } from 'zod';
import { sceneVisibilityDto } from '../library/library.dto';
import { documentTabSummaryDto } from './document-tab.dto';
import { documentVersionDto, versionedActionShape } from './document-version.dto';

export const DOCUMENT_NAME_MAX_LENGTH = 60;
export const UNNAMED_DOCUMENT_NAME = 'Documento sem nome';
const documentNameDto = z.string().trim().min(1).max(DOCUMENT_NAME_MAX_LENGTH);
export const documentOwnerIdsDto = z
  .array(z.uuid())
  .refine((ids) => new Set(ids).size === ids.length, 'Expected unique document owner IDs');
export const documentSummaryDto = z.strictObject({
  id: z.uuid(),
  name: documentNameDto,
  folderId: z.uuid().nullable(),
  visibility: sceneVisibilityDto,
  version: documentVersionDto,
  updatedAt: z.iso.datetime(),
  canEdit: z.boolean(),
  canManage: z.boolean(),
  ownerIds: documentOwnerIdsDto.optional(),
});
export type DocumentSummaryDto = z.infer<typeof documentSummaryDto>;
export const documentDto = documentSummaryDto.extend({
  schemaVersion: z.literal(2),
  tabs: z.array(documentTabSummaryDto),
});
export type DocumentDto = z.infer<typeof documentDto>;
export const createDocumentRequestDto = z.strictObject({
  actionId: z.uuid(),
  name: documentNameDto.optional(),
  folderId: z.uuid().nullable().optional(),
});
export type CreateDocumentRequestDto = z.infer<typeof createDocumentRequestDto>;
// The body moved to the tabs (PATCH …/tabs/:tabId/content); this command only renames.
export const updateDocumentContentRequestDto = z.strictObject({
  ...versionedActionShape,
  name: documentNameDto,
});
export type UpdateDocumentContentRequestDto = z.infer<typeof updateDocumentContentRequestDto>;
export const updateDocumentRequestDto = z
  .strictObject({
    ...versionedActionShape,
    folderId: z.uuid().nullable().optional(),
    visibility: sceneVisibilityDto.optional(),
    ownerIds: documentOwnerIdsDto.optional(),
  })
  .refine(
    (changes) =>
      changes.folderId !== undefined ||
      changes.visibility !== undefined ||
      changes.ownerIds !== undefined,
    'Expected administration change',
  );
export type UpdateDocumentRequestDto = z.infer<typeof updateDocumentRequestDto>;
export const deleteDocumentRequestDto = z.strictObject(versionedActionShape);
export type DeleteDocumentRequestDto = z.infer<typeof deleteDocumentRequestDto>;
export const documentParamsDto = z.strictObject({ campaignId: z.uuid(), documentId: z.uuid() });
export const documentReceiptDto = z.strictObject({
  actionId: z.uuid(),
  documentId: z.uuid(),
  tabId: z.uuid().optional(),
  version: documentVersionDto,
  operation: z.enum([
    'create',
    'content',
    'update',
    'delete',
    'tab-create',
    'tab-update',
    'tab-reorder',
    'tab-delete',
    'tab-content',
  ]),
});
export type DocumentReceiptDto = z.infer<typeof documentReceiptDto>;
export const documentResponseDto = z.strictObject({ document: documentDto });
export const documentWriteResponseDto = z.strictObject({
  document: documentDto,
  receipt: documentReceiptDto,
});
export type DocumentResponseDto = z.infer<typeof documentResponseDto>;
export type DocumentWriteResponseDto = z.infer<typeof documentWriteResponseDto>;
export const documentTabWriteResponseDto = z.strictObject({
  tab: documentTabSummaryDto,
  receipt: documentReceiptDto,
});
export type DocumentTabWriteResponseDto = z.infer<typeof documentTabWriteResponseDto>;
