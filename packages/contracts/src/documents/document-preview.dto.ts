import { z } from 'zod';
import { versionedActionShape } from './document-version.dto';

export const DOCUMENT_PREVIEW_SUMMARY_MAX_LENGTH = 280;
// Blank is not a summary: the client sends null to clear it.
const documentPreviewSummaryDto = z
  .string()
  .trim()
  .min(1)
  .max(DOCUMENT_PREVIEW_SUMMARY_MAX_LENGTH)
  .nullable();
/** What the library shows for a document instead of a thumbnail of its body. */
export const documentPreviewDto = z.strictObject({
  summary: documentPreviewSummaryDto,
  imageAssetId: z.uuid().nullable(),
});
export type DocumentPreviewDto = z.infer<typeof documentPreviewDto>;
export const EMPTY_DOCUMENT_PREVIEW: DocumentPreviewDto = { summary: null, imageAssetId: null };
// The whole preview each time: null clears the summary or the image.
export const updateDocumentPreviewRequestDto = z.strictObject({
  ...versionedActionShape,
  ...documentPreviewDto.shape,
});
export type UpdateDocumentPreviewRequestDto = z.infer<typeof updateDocumentPreviewRequestDto>;
