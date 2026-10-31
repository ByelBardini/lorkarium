import { z } from 'zod';
import { documentContentDto } from './document-content.dto';
import { documentVersionDto, versionedActionShape } from './document-version.dto';

export const DOCUMENT_TABS_MAX = 200;
export const DOCUMENT_TAB_NAME_MAX_LENGTH = 40;
export const UNNAMED_DOCUMENT_TAB_NAME = 'Nova aba';
const documentTabNameDto = z.string().trim().min(1).max(DOCUMENT_TAB_NAME_MAX_LENGTH);
export const documentTabVisibilityDto = z.enum(['document', 'masters']);
export type DocumentTabVisibilityDto = z.infer<typeof documentTabVisibilityDto>;
export const documentTabSummaryDto = z.strictObject({
  id: z.uuid(),
  name: documentTabNameDto,
  visibility: documentTabVisibilityDto,
  version: documentVersionDto,
  updatedAt: z.iso.datetime(),
});
export type DocumentTabSummaryDto = z.infer<typeof documentTabSummaryDto>;
export const documentTabDto = documentTabSummaryDto.extend({
  schemaVersion: z.literal(1),
  content: documentContentDto,
});
export type DocumentTabDto = z.infer<typeof documentTabDto>;
export const documentTabResponseDto = z.strictObject({ tab: documentTabDto });
export type DocumentTabResponseDto = z.infer<typeof documentTabResponseDto>;
export const documentTabParamsDto = z.strictObject({
  campaignId: z.uuid(),
  documentId: z.uuid(),
  tabId: z.uuid(),
});
export const createDocumentTabRequestDto = z.strictObject({
  ...versionedActionShape,
  name: documentTabNameDto.optional(),
});
export type CreateDocumentTabRequestDto = z.infer<typeof createDocumentTabRequestDto>;
export const updateDocumentTabRequestDto = z
  .strictObject({
    ...versionedActionShape,
    name: documentTabNameDto.optional(),
    visibility: documentTabVisibilityDto.optional(),
  })
  .refine(
    (changes) => changes.name !== undefined || changes.visibility !== undefined,
    'Expected tab name or visibility change',
  );
export type UpdateDocumentTabRequestDto = z.infer<typeof updateDocumentTabRequestDto>;
export const reorderDocumentTabsRequestDto = z.strictObject({
  ...versionedActionShape,
  tabIds: z
    .array(z.uuid())
    .min(1)
    .max(DOCUMENT_TABS_MAX)
    .refine((ids) => new Set(ids).size === ids.length, 'Expected unique document tab IDs'),
});
export type ReorderDocumentTabsRequestDto = z.infer<typeof reorderDocumentTabsRequestDto>;
export const deleteDocumentTabRequestDto = z.strictObject(versionedActionShape);
export type DeleteDocumentTabRequestDto = z.infer<typeof deleteDocumentTabRequestDto>;
// expectedVersion here is the tab's own version: editing one tab never conflicts with another.
export const updateDocumentTabContentRequestDto = z.strictObject({
  ...versionedActionShape,
  content: documentContentDto,
});
export type UpdateDocumentTabContentRequestDto = z.infer<typeof updateDocumentTabContentRequestDto>;
