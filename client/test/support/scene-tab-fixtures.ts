import type {
  BoardStateDto,
  LibraryChangedDto,
  SceneActivatedDto,
  SceneClosedDto,
  SceneClosedReasonDto,
  SceneDto,
} from '@lorkarium/contracts';
import { VHARN } from './campaigns-api-fake';
import { VHARN_SCENE, vharnBoard } from './table-session-fixtures';

const AT = '2026-10-23T12:00:00.000Z';

/** A public grid of VHARN that is not the group one: the extra tab of the tests. */
export const TORRE_SCENE: SceneDto = {
  ...VHARN_SCENE,
  id: '8e7d6c5b-4a3f-4e2d-9c1b-0a9f8e7d6c5b',
  name: 'Torre',
  widthCells: 16,
  heightCells: 16,
};

/** The grid the master takes the group to in the tests. */
export const ESTRADA_SCENE: SceneDto = {
  ...VHARN_SCENE,
  id: '9f8e7d6c-5b4a-4f3e-8d2c-1b0a9f8e7d6c',
  name: 'Estrada de Vharn',
  widthCells: 30,
  heightCells: 20,
};

export const TORRE_GRID = { campaignId: VHARN.id, sceneId: TORRE_SCENE.id } as const;

/** The Torre as Ana (master) sees it at version 2: empty.
 *
 *  Example: `torreBoard({ version: 3 })` */
export function torreBoard(overrides: Partial<BoardStateDto> = {}): BoardStateDto {
  return vharnBoard({ version: 2, scene: TORRE_SCENE, ...overrides });
}

/** The Estrada as Ana sees it at version 7, once the group is there. */
export function estradaBoard(overrides: Partial<BoardStateDto> = {}): BoardStateDto {
  return vharnBoard({ version: 7, scene: ESTRADA_SCENE, ...overrides });
}

/** `scene:activated` of VHARN: the master took the group from Cena 1 to the Estrada.
 *
 *  Example: `sceneActivated({ sceneId: TORRE_SCENE.id })` */
export function sceneActivated(overrides: Partial<SceneActivatedDto> = {}): SceneActivatedDto {
  return {
    campaignId: VHARN.id,
    sceneId: ESTRADA_SCENE.id,
    previousSceneId: VHARN_SCENE.id,
    at: AT,
    ...overrides,
  };
}

/** `scene:closed` of the Torre at VHARN, for `reason`.
 *
 *  Example: `sceneClosed('deleted')` */
export function sceneClosed(
  reason: SceneClosedReasonDto,
  overrides: Partial<SceneClosedDto> = {},
): SceneClosedDto {
  return { campaignId: VHARN.id, sceneId: TORRE_SCENE.id, reason, at: AT, ...overrides };
}

/** `library:changed` of VHARN. */
export function libraryChanged(overrides: Partial<LibraryChangedDto> = {}): LibraryChangedDto {
  return { campaignId: VHARN.id, at: AT, ...overrides };
}
