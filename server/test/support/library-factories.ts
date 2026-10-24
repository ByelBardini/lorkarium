import type { SceneFolderPo } from '../../src/modules/library/scene-folders.po';
import type { LibrarySceneRow } from '../../src/modules/scenes/scenes.dao';
import type { ScenePo } from '../../src/modules/scenes/scenes.po';
import { VHARN_ID } from './campaigns-factories';
import { scenePo, sceneRow } from './scenes-factories';

export const ATO_1_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
export const MASMORRA_ID = '1b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e';
export const QUELM_FOLDER_ID = '2c3d4e5f-6a7b-4c8d-8e9f-1a2b3c4d5e6f';
export const TORRE_ID = '3d4e5f6a-7b8c-4d9e-9f0a-2b3c4d5e6f7a';

/** A persisted folder of the library, at the root of Vharn by default.
 *
 *  Example: `sceneFolderPo({ id: MASMORRA_ID, name: 'Masmorra', parentId: ATO_1_ID })` */
export function sceneFolderPo(overrides: Partial<SceneFolderPo> = {}): SceneFolderPo {
  return {
    id: ATO_1_ID,
    campaignId: VHARN_ID,
    parentId: null,
    name: 'Ato 1',
    createdAt: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}

/** A scene as the library lists it: the row, its background pixels and its token count.
 *
 *  Example: `librarySceneRow({ id: TORRE_ID, visibility: 'public', tokenCount: 3 })` */
export function librarySceneRow(overrides: Partial<LibrarySceneRow> = {}): LibrarySceneRow {
  return { ...sceneRow(), tokenCount: 0, ...overrides };
}

/** The Torre: a private grid of Vharn that is not the group one, at version 7.
 *
 *  Example: `new ScenesDaoFake([scenePo({ version: 4 }), torrePo()])` */
export function torrePo(overrides: Partial<ScenePo> = {}): ScenePo {
  return scenePo({ id: TORRE_ID, name: 'Torre', version: 7, ...overrides });
}
