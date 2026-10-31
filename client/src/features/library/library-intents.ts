import {
  createSceneFolderRequestDto,
  updateLibraryImageRequestDto,
  updateLibrarySceneRequestDto,
  updateSceneFolderRequestDto,
  createDocumentRequestDto,
  updateDocumentRequestDto,
  deleteDocumentRequestDto,
  createSheetTemplateRequestDto,
  updateSheetTemplateRequestDto,
  createSheetRequestDto,
  updateSheetRequestDto,
  deleteSheetRequestDto,
} from '@lorkarium/contracts';
import { z } from 'zod';

const id = z.string().min(1);

/** What the library screen asks of its route `action` (sent as JSON by the library fetcher). */
export const libraryIntentDto = z.discriminatedUnion('intent', [
  z.strictObject({ intent: z.literal('createDocument'), changes: createDocumentRequestDto }),
  z.strictObject({
    intent: z.literal('updateDocument'),
    documentId: id,
    changes: updateDocumentRequestDto,
  }),
  z.strictObject({
    intent: z.literal('removeDocument'),
    documentId: id,
    changes: deleteDocumentRequestDto,
  }),
  z.strictObject({ intent: z.literal('createScene'), folderId: id.nullable() }),
  z.strictObject({
    intent: z.literal('updateScene'),
    sceneId: id,
    changes: updateLibrarySceneRequestDto,
  }),
  z.strictObject({ intent: z.literal('duplicateScene'), sceneId: id }),
  z.strictObject({ intent: z.literal('removeScene'), sceneId: id }),
  z.strictObject({
    intent: z.literal('updateImage'),
    imageId: id,
    changes: updateLibraryImageRequestDto,
  }),
  z.strictObject({ intent: z.literal('removeImage'), imageId: id }),
  z.strictObject({ intent: z.literal('activateScene'), sceneId: id }),
  z.strictObject({ intent: z.literal('createFolder'), folder: createSceneFolderRequestDto }),
  z.strictObject({
    intent: z.literal('updateFolder'),
    folderId: id,
    changes: updateSceneFolderRequestDto,
  }),
  z.strictObject({ intent: z.literal('removeFolder'), folderId: id }),
  z.strictObject({
    intent: z.literal('createSheetTemplate'),
    template: createSheetTemplateRequestDto,
  }),
  z.strictObject({
    intent: z.literal('updateSheetTemplate'),
    templateId: id,
    changes: updateSheetTemplateRequestDto,
  }),
  z.strictObject({ intent: z.literal('removeSheetTemplate'), templateId: id }),
  z.strictObject({ intent: z.literal('createSheet'), sheet: createSheetRequestDto }),
  z.strictObject({ intent: z.literal('updateSheet'), sheetId: id, changes: updateSheetRequestDto }),
  z.strictObject({ intent: z.literal('removeSheet'), sheetId: id, changes: deleteSheetRequestDto }),
]);

export type LibraryIntent = z.infer<typeof libraryIntentDto>;

/** What the action answers: the id the server gave (a new grid, copy or folder), or the
 *  refusal already worded for the status line. */
export type LibraryOutcome =
  | Readonly<{ intent: LibraryIntent['intent']; ok: true; createdId: string | null }>
  | Readonly<{ intent: LibraryIntent['intent']; ok: false; message: string }>;
