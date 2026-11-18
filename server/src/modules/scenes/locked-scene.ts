import type { ClockPort } from '../auth/clock.port';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { PlanLimitsBo, effectiveLimitsOf } from '../plans/plan-limits.bo';
import { SceneAccessBo, type GridReach } from './scene-access.bo';
import type { AddressedSceneRow, ScenesDao } from './scenes.dao';
import { SceneNotFoundError } from './scenes.error';

/** What a board transaction addressed to any grid needs: that grid's lock and its version. */
export type GridLockDaos = Readonly<{ scenes: Pick<ScenesDao, 'lockInCampaign' | 'bumpVersion'> }>;

export type SceneTransaction<Daos> = <T>(work: (daos: Daos) => Promise<T>) => Promise<T>;
export type LockedGrid<Daos> = Readonly<{ daos: Daos; scene: AddressedSceneRow }>;
/** The version a transaction left one grid at. */
export type SavedVersion = Readonly<{ sceneId: string; version: number }>;
/** What a board transaction saved, the version it produced and the grid it was on. */
export type SavedInScene<T> = Readonly<{ value: T; version: number; sceneId: string }>;
/** The fields every event of one grid opens with (spec §5.5). */
export type GridEventBase = Readonly<{
  campaignId: string;
  sceneId: string;
  version: number;
  at: string;
}>;

/** What a creating command answers: the version and the ids given, in the order sent. */
export type CreatedInScene = Readonly<{ version: number; createdIds: string[] }>;

/** What `reachedGridOf` reads of a grid: which one, its visibility and whether it is the group's. */
export type ReachedGrid = GridReach & Readonly<{ isActive: boolean }>;

/** The grid a command or a snapshot names: absent `sceneId` = the group grid. `access` is the
 *  requester's role at the table, already known to be a member. */
export type GridAddress = Readonly<{
  campaignId: string;
  sceneId?: string | undefined;
  access: CampaignAccessBo;
}>;

/** Lock the addressed grid → check the requester reaches it → work → bump its version, in one
 *  transaction (spec §5.5). The one place a board command's grid is checked: out of reach is
 *  SCENE_NOT_FOUND before the work runs; the caller publishes after the commit.
 *
 *  Example: `await inLockedGrid(transaction, { campaignId, sceneId, access }, ({ daos, scene }) => …)` */
export async function inLockedGrid<Daos extends GridLockDaos, T>(
  transaction: SceneTransaction<Daos>,
  address: GridAddress,
  work: (locked: LockedGrid<Daos>) => Promise<T>,
): Promise<SavedInScene<T>> {
  return transaction(async (daos) => {
    const row = await daos.scenes.lockInCampaign(address.campaignId, address.sceneId);
    const scene = reachedGridOf(address, row);
    const value = await work({ daos, scene });
    return { value, version: await daos.scenes.bumpVersion(scene.id), sceneId: scene.id };
  });
}

/** Refuses with PLAN_LIMIT `readOnly` a change of setup (ruler, background, walls) on a grid past
 *  the owner's plan, ranked among its table's grids; play on it never calls this. Call it inside
 *  `inLockedGrid`, with the DAO of its `tx`.
 *
 *  Example: `await requireEditableGrid(locked.daos.scenes, locked.scene)` */
export async function requireEditableGrid(
  scenes: Pick<ScenesDao, 'rankOf'>,
  scene: Pick<AddressedSceneRow, 'id' | 'campaignId' | 'owner'>,
): Promise<void> {
  const rank = await scenes.rankOf(scene.campaignId, scene.id);
  PlanLimitsBo.requireEditable('scenes', rank, effectiveLimitsOf(scene.owner));
}

/** Whether the grid is past the owner's plan, ranked among its table's grids: the `planLocked`
 *  of the scene the room receives. One count, in the snapshot's or the write's transaction.
 *
 *  Example: `await gridPlanLockOf(daos.scenes, scene) // true for the 4th grid of a free table` */
export async function gridPlanLockOf(
  scenes: Pick<ScenesDao, 'rankOf'>,
  scene: Pick<AddressedSceneRow, 'id' | 'campaignId' | 'owner'>,
): Promise<boolean> {
  const rank = await scenes.rankOf(scene.campaignId, scene.id);
  return PlanLimitsBo.isReadOnly('scenes', rank, effectiveLimitsOf(scene.owner));
}

/** The grid read for an address, if the requester may act on it: the master any grid of the
 *  table, a player the group grid or a public one; the rest and an unknown id are
 *  SCENE_NOT_FOUND.
 *
 *  Example: `reachedGridOf(address, await scenes.findGridInCampaign(campaignId, sceneId))` */
export function reachedGridOf<Scene extends ReachedGrid>(
  address: GridAddress,
  scene: Scene | undefined,
): Scene {
  const found = addressedGridOf(address, scene);
  new SceneAccessBo(address.access, groupIdOf(found)).requireAct(found);
  return found;
}

function addressedGridOf<Scene extends ReachedGrid>(
  { campaignId, sceneId, access }: GridAddress,
  scene: Scene | undefined,
): Scene {
  if (scene) return scene;
  if (sceneId === undefined) return activeSceneOf<Scene>(campaignId, scene);
  throw new SceneNotFoundError(campaignId, sceneId, access.userIdOf());
}

function groupIdOf(scene: ReachedGrid): string | null {
  return scene.isActive ? scene.id : null;
}

/** The scene read for a campaign; every campaign has one, so a missing scene is a broken table.
 *
 *  Example: `activeSceneOf(campaignId, await scenes.findActiveOf(campaignId))` */
export function activeSceneOf<Scene>(campaignId: string, scene: Scene | undefined): Scene {
  if (scene) return scene;
  throw new Error(`campaign ${campaignId} has no active scene; every campaign has one`);
}

/** The opening of an event about what a grid transaction saved: its table, grid, version and now.
 *
 *  Example: `publisher.wallsCreated({ ...gridEventBase(campaignId, saved, clock), walls })` */
export function gridEventBase(
  campaignId: string,
  saved: Pick<SavedInScene<unknown>, 'version' | 'sceneId'>,
  clock: ClockPort,
): GridEventBase {
  const { version, sceneId } = saved;
  return { campaignId, sceneId, version, at: clock.now().toISOString() };
}
