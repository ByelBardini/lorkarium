import type { LibraryDto, LibrarySceneDto, PlanLimits, SceneFolderDto } from '@lorkarium/contracts';
import { PlanLimitsBo, type PlanEditableResource } from '../plans/plan-limits.bo';
import { backgroundOfScene } from '../scenes/scenes.mapper';
import type { LibrarySceneRow, SceneRow } from '../scenes/scenes.dao';
import type { NewScenePo } from '../scenes/scenes.po';
import type { VisibleLibrary } from './scene-library.bo';
import type { SceneFolderPo } from './scene-folders.po';

/** Where an item stands in its group (how many were born before it, from 0) and the limits of
 *  the table's owner: what its `planLocked` comes from. */
export type PlanRank = Readonly<{ rank: number; limits: PlanLimits }>;

/** Whether the item at `rank` is read only by the owner's plan (`PlanLimitsBo.isReadOnly`, the
 *  same rule the writes refuse by), so a list and a write never disagree.
 *
 *  Example: `planLockedOf('scenes', { rank: 3, limits: PLAN_LIMITS.free }) // true` */
export function planLockedOf(resource: PlanEditableResource, { rank, limits }: PlanRank): boolean {
  return PlanLimitsBo.isReadOnly(resource, rank, limits);
}

/** The rank of each item of a list read oldest first (its place in that list), with the owner's
 *  limits: one pass over rows already loaded, never a query per item.
 *
 *  Example: `planRanksOf(await scenes.listOfCampaign(campaignId), limits)(cryptaId).rank // 3` */
export function planRanksOf(
  ordered: readonly Readonly<{ id: string }>[],
  limits: PlanLimits,
): (id: string) => PlanRank {
  const ranks = new Map(ordered.map(({ id }, rank) => [id, rank]));
  return (id) => {
    const rank = ranks.get(id);
    if (rank === undefined)
      throw new Error(
        `item ${id} is not in the ranked list; expected one of its ${ranks.size} ids`,
      );
    return { rank, limits };
  };
}

/** A library row → the card a member sees; `seesTokenCount` is false for a player, who gets
 *  `null` (what is on a grid is the master's business); `place` decides `planLocked`.
 *
 *  Example: `toLibrarySceneDto(row, access.isMaster(), { rank: 3, limits }).planLocked // true on free` */
export function toLibrarySceneDto(
  row: LibrarySceneRow,
  seesTokenCount: boolean,
  place: PlanRank,
): LibrarySceneDto {
  return {
    id: row.id,
    name: row.name,
    folderId: row.folderId,
    visibility: row.visibility,
    widthCells: row.widthCells,
    heightCells: row.heightCells,
    background: backgroundOfScene(row),
    tokenCount: seesTokenCount ? row.tokenCount : null,
    planLocked: planLockedOf('scenes', place),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A folder row → the folder of the library.
 *
 *  Example: `toSceneFolderDto(row).parentId // null at the root` */
export function toSceneFolderDto(row: SceneFolderPo): SceneFolderDto {
  return { id: row.id, name: row.name, parentId: row.parentId, visibility: row.visibility };
}

/** What the rule let a member see → the body of `GET …/scenes`; `placeOf` ranks each grid among
 *  all of the table's (`planRanksOf`), not only the visible ones.
 *
 *  Example: `toLibraryDto(activeSceneId, library.visibleTo(sceneAccess), access.isMaster(), placeOf)` */
export function toLibraryDto(
  activeSceneId: string | null,
  visible: VisibleLibrary<SceneFolderPo, LibrarySceneRow>,
  seesTokenCount: boolean,
  placeOf: (sceneId: string) => PlanRank,
): LibraryDto {
  return {
    activeSceneId,
    folders: visible.folders.map(toSceneFolderDto),
    scenes: visible.scenes.map((row) => toLibrarySceneDto(row, seesTokenCount, placeOf(row.id))),
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
    freeMovement: source.freeMovement,
  };
}
