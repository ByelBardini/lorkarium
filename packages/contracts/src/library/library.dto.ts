import { z } from 'zod';
import { sceneBackgroundDto } from '../board/scene.dto';

export const SCENE_NAME_MAX_LENGTH = 60;
export const SCENE_FOLDER_NAME_MAX_LENGTH = 40;
// A root folder is level 1; deeper trees stop being browsable in the library sidebar.
export const SCENE_FOLDER_DEPTH_MAX = 5;
/** The name of a grid the master creates without one. */
export const UNNAMED_SCENE_NAME = 'Grid sem nome';
/** What "Duplicar" adds to the name of the copy. */
export const SCENE_COPY_SUFFIX = ' (cópia)';

const LIBRARY_SCENE_CHANGE_KEYS = ['name', 'folderId', 'visibility'] as const;

/** Who sees a grid in the library: only the master (`private`) or every member (`public`). */
export const sceneVisibilityDto = z.enum(['private', 'public']);
export type SceneVisibilityDto = z.infer<typeof sceneVisibilityDto>;

const sceneNameDto = z.string().trim().min(1).max(SCENE_NAME_MAX_LENGTH);
const sceneFolderNameDto = z.string().trim().min(1).max(SCENE_FOLDER_NAME_MAX_LENGTH);

/** A folder of the library; `parentId: null` = the root.
 *
 *  Example: `sceneFolderDto.parse({ id, name: 'Ato 1', parentId: null })` */
export const sceneFolderDto = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  parentId: z.uuid().nullable(),
});
export type SceneFolderDto = z.infer<typeof sceneFolderDto>;

/** A grid as the library card shows it. `tokenCount` is `null` for a player (what is on a grid
 *  is the master's business); `folderId: null` = no folder.
 *
 *  Example: `librarySceneDto.parse(body).visibility // 'private'` */
export const librarySceneDto = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  folderId: z.uuid().nullable(),
  visibility: sceneVisibilityDto,
  widthCells: z.number().int().positive(),
  heightCells: z.number().int().positive(),
  background: sceneBackgroundDto.nullable(),
  tokenCount: z.number().int().nonnegative().nullable(),
  updatedAt: z.iso.datetime(),
});
export type LibrarySceneDto = z.infer<typeof librarySceneDto>;

/** `GET /campaigns/:campaignId/scenes`: what the member may see of the library, in creation
 *  order, and which grid the group is on.
 *
 *  Example: `libraryDto.parse(body).scenes.length // 3` */
export const libraryDto = z.strictObject({
  activeSceneId: z.uuid().nullable(),
  folders: z.array(sceneFolderDto),
  scenes: z.array(librarySceneDto),
});
export type LibraryDto = z.infer<typeof libraryDto>;

/** Body of `POST /campaigns/:campaignId/scenes`: both optional (no name = `UNNAMED_SCENE_NAME`,
 *  no folder = the root). The name is trimmed.
 *
 *  Example: `createLibrarySceneRequestDto.parse({ folderId: ato1Id })` */
export const createLibrarySceneRequestDto = z.strictObject({
  name: sceneNameDto.optional(),
  folderId: z.uuid().nullable().optional(),
});
export type CreateLibrarySceneRequestDto = z.infer<typeof createLibrarySceneRequestDto>;

/** Body of `PATCH /campaigns/:campaignId/scenes/:sceneId`: an absent key stays, `folderId: null`
 *  takes the grid to the root; at least one key.
 *
 *  Example: `updateLibrarySceneRequestDto.parse({ name: '  Torre ' }) // { name: 'Torre' }` */
export const updateLibrarySceneRequestDto = z
  .strictObject({
    name: sceneNameDto.optional(),
    folderId: z.uuid().nullable().optional(),
    visibility: sceneVisibilityDto.optional(),
  })
  .superRefine((changes, context) => {
    if (Object.keys(changes).length > 0) return;
    context.addIssue({
      code: 'custom',
      message: `changes is empty; expected at least one of ${LIBRARY_SCENE_CHANGE_KEYS.join(', ')}`,
    });
  });
export type UpdateLibrarySceneRequestDto = z.infer<typeof updateLibrarySceneRequestDto>;

/** Params of the routes of one grid of the library. */
export const librarySceneParamsDto = z.strictObject({ campaignId: z.uuid(), sceneId: z.uuid() });

/** Body of `POST /campaigns/:campaignId/scene-folders`: the name is trimmed; no `parentId` (or
 *  `null`) = the root.
 *
 *  Example: `createSceneFolderRequestDto.parse({ name: 'Masmorra', parentId: ato1Id })` */
export const createSceneFolderRequestDto = z.strictObject({
  name: sceneFolderNameDto,
  parentId: z.uuid().nullable().optional(),
});
export type CreateSceneFolderRequestDto = z.infer<typeof createSceneFolderRequestDto>;

/** Body of `PATCH /campaigns/:campaignId/scene-folders/:folderId`: rename and/or move
 *  (`parentId: null` = the root); at least one key.
 *
 *  Example: `updateSceneFolderRequestDto.parse({ parentId: null })` */
export const updateSceneFolderRequestDto = z
  .strictObject({
    name: sceneFolderNameDto.optional(),
    parentId: z.uuid().nullable().optional(),
  })
  .superRefine((changes, context) => {
    if (Object.keys(changes).length > 0) return;
    context.addIssue({
      code: 'custom',
      message: 'changes is empty; expected at least one of name, parentId',
    });
  });
export type UpdateSceneFolderRequestDto = z.infer<typeof updateSceneFolderRequestDto>;

/** Params of the routes of one folder of the library. */
export const sceneFolderParamsDto = z.strictObject({ campaignId: z.uuid(), folderId: z.uuid() });

/** `library:changed`: something in the library changed; each client reads it again by the
 *  route (no grid data goes through the socket, so a private grid never leaks).
 *
 *  Example: `libraryChangedDto.parse({ campaignId, at })` */
export const libraryChangedDto = z.strictObject({ campaignId: z.uuid(), at: z.iso.datetime() });
export type LibraryChangedDto = z.infer<typeof libraryChangedDto>;

/** `scene:activated` (to the whole table): the master took the group to `sceneId`; the group grid
 *  was `previousSceneId` (`null` for a table that had none). Every socket of the table is already
 *  in the rooms of the new one.
 *
 *  Example: `sceneActivatedDto.parse({ campaignId, sceneId: estradaId, previousSceneId: salaoId, at })` */
export const sceneActivatedDto = z.strictObject({
  campaignId: z.uuid(),
  sceneId: z.uuid(),
  previousSceneId: z.uuid().nullable(),
  at: z.iso.datetime(),
});
export type SceneActivatedDto = z.infer<typeof sceneActivatedDto>;

/** Why a grid tab was closed by the server: the grid became private or was deleted. */
export const sceneClosedReasonDto = z.enum(['private', 'deleted']);
export type SceneClosedReasonDto = z.infer<typeof sceneClosedReasonDto>;

/** `scene:closed` (to each socket taken out of a grid): its tab of `sceneId` is gone, and no
 *  event of that grid reaches it any more.
 *
 *  Example: `sceneClosedDto.parse({ campaignId, sceneId: torreId, reason: 'private', at })` */
export const sceneClosedDto = z.strictObject({
  campaignId: z.uuid(),
  sceneId: z.uuid(),
  reason: sceneClosedReasonDto,
  at: z.iso.datetime(),
});
export type SceneClosedDto = z.infer<typeof sceneClosedDto>;

/** Every server → client event of the library. */
export type LibraryServerEvents = {
  'library:changed': (event: LibraryChangedDto) => void;
  'scene:activated': (event: SceneActivatedDto) => void;
  'scene:closed': (event: SceneClosedDto) => void;
};
