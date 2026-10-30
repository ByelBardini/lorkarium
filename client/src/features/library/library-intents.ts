import {
  createSceneFolderRequestDto,
  updateLibraryImageRequestDto,
  updateLibrarySceneRequestDto,
  updateSceneFolderRequestDto,
} from '@lorkarium/contracts';
import { z } from 'zod';

const id = z.string().min(1);

/** What the library screen asks of its route `action` (sent as JSON by the library fetcher). */
export const libraryIntentDto = z.discriminatedUnion('intent', [
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
]);

export type LibraryIntent = z.infer<typeof libraryIntentDto>;

/** What the action answers: the id the server gave (a new grid, copy or folder), or the
 *  refusal already worded for the status line. */
export type LibraryOutcome =
  | Readonly<{ intent: LibraryIntent['intent']; ok: true; createdId: string | null }>
  | Readonly<{ intent: LibraryIntent['intent']; ok: false; message: string }>;
