import { z } from 'zod';
import { documentContentDto } from '../documents/document-content.dto';
import { documentSummaryDto } from '../documents/document.dto';
import { DOCUMENT_TABS_MAX, documentTabSummaryDto } from '../documents/document-tab.dto';
import { SCENE_FOLDER_DEPTH_MAX } from '../library/library.dto';

// What the host answers to the frame's document reads (manifest permission `documents:read`).

/** A document as the sheet lists it: id, name and the names of its folders, root first.
 *
 *  Example: `sheetFrameDocumentDto.parse({ id, name: 'Bestiário', folderPath: ['Mundo'] })` */
export const sheetFrameDocumentDto = z.strictObject({
  id: z.uuid(),
  name: documentSummaryDto.shape.name,
  folderPath: z.array(z.string()).max(SCENE_FOLDER_DEPTH_MAX),
});
export type SheetFrameDocumentDto = z.infer<typeof sheetFrameDocumentDto>;

/** A tab as the sheet lists it, in the document's order. */
export const sheetFrameDocumentTabDto = z.strictObject({
  id: z.uuid(),
  name: documentTabSummaryDto.shape.name,
});
export type SheetFrameDocumentTabDto = z.infer<typeof sheetFrameDocumentTabDto>;

/** One tab's body: the Tiptap tree (revalidated) and its plain text, blocks one per line.
 *
 *  Example: `sheetFrameDocumentTabContentDto.parse({ id, name: 'Geral', content, text: 'Goblin' })` */
export const sheetFrameDocumentTabContentDto = sheetFrameDocumentTabDto.extend({
  content: documentContentDto,
  text: z.string(),
});
export type SheetFrameDocumentTabContentDto = z.infer<typeof sheetFrameDocumentTabContentDto>;

/** What a `result` of a document read carries, each under its own key so the union never
 *  confuses one with another. */
export const sheetFrameDocumentResultDtos = [
  z.strictObject({ documents: z.array(sheetFrameDocumentDto) }),
  z.strictObject({ tabs: z.array(sheetFrameDocumentTabDto).max(DOCUMENT_TABS_MAX) }),
  z.strictObject({ tab: sheetFrameDocumentTabContentDto }),
] as const;
