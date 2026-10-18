import type { ConfigureSceneCommandDto, SceneBackgroundDto, SceneDto } from '@lorkarium/contracts';
import type { SceneGrid } from './scene-config.bo';
import type { SceneRow } from './scenes.dao';
import type { SceneGridPo } from './scenes.po';

/** Scene row → the scene clients see; Postgres numeric "1.50" becomes 1.5, and the background
 *  carries the pixels of its image.
 *
 *  Example: `toSceneDto(await scenesDao.findActiveOf(campaignId)).cellDistance // 1.5` */
export function toSceneDto(scene: SceneRow): SceneDto {
  return {
    id: scene.id,
    name: scene.name,
    widthCells: scene.widthCells,
    heightCells: scene.heightCells,
    cellDistance: Number(scene.cellDistance),
    cellUnit: scene.cellUnit,
    gridVisible: scene.gridVisible,
    gridOpacity: scene.gridOpacity,
    background: backgroundOfScene(scene),
    vision: scene.visionMode,
  };
}

/** The background of a scene row, or `null` when it has none (or its asset is gone).
 *
 *  Example: `backgroundOfScene(row)?.width // 1400` */
export function backgroundOfScene(scene: SceneRow): SceneBackgroundDto | null {
  const { backgroundAssetId: assetId, backgroundWidth: width, backgroundHeight: height } = scene;
  if (assetId === null || width === null || height === null) return null;
  return { assetId, width, height };
}

/** Grid decided by the rule → the columns to save.
 *
 *  Example: `await scenesDao.update(scene.id, toSceneGridPo(grid))` */
export function toSceneGridPo(grid: SceneGrid): SceneGridPo {
  return { ...grid, cellDistance: String(grid.cellDistance) };
}

/** `scene:configure` payload → the grid for the rule, without the command envelope.
 *
 *  Example: `await scenesService.configure(userId, command.campaignId, toSceneGrid(command))` */
export function toSceneGrid(command: ConfigureSceneCommandDto): SceneGrid {
  const { widthCells, heightCells, cellDistance, cellUnit, gridVisible, gridOpacity } = command;
  return { widthCells, heightCells, cellDistance, cellUnit, gridVisible, gridOpacity };
}
