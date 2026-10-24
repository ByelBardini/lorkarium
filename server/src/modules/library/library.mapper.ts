import type { LibraryDto, LibrarySceneDto, SceneFolderDto } from '@lorkarium/contracts';
import { backgroundOfScene } from '../scenes/scenes.mapper';
import type { LibrarySceneRow, SceneRow } from '../scenes/scenes.dao';
import type { NewScenePo } from '../scenes/scenes.po';
import type { VisibleLibrary } from './scene-library.bo';
import type { SceneFolderPo } from './scene-folders.po';

/** A library row → the card a member sees; `seesTokenCount` is false for a player, who gets
 *  `null` (what is on a grid is the master's business).
 *
 *  Example: `toLibrarySceneDto(row, access.isMaster()).tokenCount // 14` */
export function toLibrarySceneDto(row: LibrarySceneRow, seesTokenCount: boolean): LibrarySceneDto {
  return {
    id: row.id,
    name: row.name,
    folderId: row.folderId,
    visibility: row.visibility,
    widthCells: row.widthCells,
    heightCells: row.heightCells,
    background: backgroundOfScene(row),
    tokenCount: seesTokenCount ? row.tokenCount : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A folder row → the folder of the library.
 *
 *  Example: `toSceneFolderDto(row).parentId // null at the root` */
export function toSceneFolderDto(row: SceneFolderPo): SceneFolderDto {
  return { id: row.id, name: row.name, parentId: row.parentId };
}

/** What the rule let a member see → the body of `GET …/scenes`.
 *
 *  Example: `toLibraryDto(activeSceneId, library.visibleTo(sceneAccess), access.isMaster())` */
export function toLibraryDto(
  activeSceneId: string | null,
  visible: VisibleLibrary<SceneFolderPo, LibrarySceneRow>,
  seesTokenCount: boolean,
): LibraryDto {
  return {
    activeSceneId,
    folders: visible.folders.map(toSceneFolderDto),
    scenes: visible.scenes.map((row) => toLibrarySceneDto(row, seesTokenCount)),
  };
}

/** The scene row of a grid's copy: the same grid, background and vision, in the same folder,
 *  private and at version 0; `name` already carries the suffix.
 *
 *  Example: `await scenes.insert(toSceneCopyPo(source, sceneCopyName(source.name, …)))` */
export function toSceneCopyPo(source: SceneRow, name: string): NewScenePo {
  return {
    campaignId: source.campaignId,
    name,
    folderId: source.folderId,
    visibility: 'private',
    widthCells: source.widthCells,
    heightCells: source.heightCells,
    cellDistance: source.cellDistance,
    cellUnit: source.cellUnit,
    gridVisible: source.gridVisible,
    gridOpacity: source.gridOpacity,
    backgroundAssetId: source.backgroundAssetId,
    visionMode: source.visionMode,
  };
}
