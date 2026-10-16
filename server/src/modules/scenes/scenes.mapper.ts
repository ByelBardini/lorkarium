import type { ConfigureSceneCommandDto, SceneDto } from '@lorkarium/contracts';
import type { SceneGrid } from './scene-config.bo';
import type { SceneGridPo, ScenePo } from './scenes.po';

/** Scene row → the scene clients see; Postgres numeric "1.50" becomes 1.5.
 *
 *  Example: `toSceneDto(await scenesDao.update(scene.id, grid)).cellDistance // 1.5` */
export function toSceneDto(scene: ScenePo): SceneDto {
  return {
    id: scene.id,
    name: scene.name,
    widthCells: scene.widthCells,
    heightCells: scene.heightCells,
    cellDistance: Number(scene.cellDistance),
    cellUnit: scene.cellUnit,
    gridVisible: scene.gridVisible,
    gridOpacity: scene.gridOpacity,
  };
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
