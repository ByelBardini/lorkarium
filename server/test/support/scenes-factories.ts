import type { SceneRow } from '../../src/modules/scenes/scenes.dao';
import type { ScenePo } from '../../src/modules/scenes/scenes.po';
import { VHARN_ID } from './campaigns-factories';

export const VHARN_SCENE_ID = '7d3c2b1a-0f9e-4d8c-b7a6-5e4d3c2b1a0f';

/** A persisted scene row with the default grid.
 *
 *  Example: `scenePo({ widthCells: 30, version: 4 })` */
export function scenePo(overrides: Partial<ScenePo> = {}): ScenePo {
  return {
    id: VHARN_SCENE_ID,
    campaignId: VHARN_ID,
    name: 'Cena 1',
    widthCells: 20,
    heightCells: 12,
    cellDistance: '1.50',
    cellUnit: 'm',
    gridVisible: true,
    gridOpacity: 30,
    backgroundAssetId: null,
    visionMode: 'off',
    version: 0,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    updatedAt: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}

/** A scene as the DAO reads it: the row plus the pixels of its background (none by default).
 *
 *  Example: `sceneRow({ backgroundAssetId: id, backgroundWidth: 1400, backgroundHeight: 700 })` */
export function sceneRow(overrides: Partial<SceneRow> = {}): SceneRow {
  return { ...scenePo(), backgroundWidth: null, backgroundHeight: null, ...overrides };
}
