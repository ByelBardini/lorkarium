import type { ClockPort } from '../auth/clock.port';
import {
  reachedGridOf,
  type GridAddress,
  type GridEventBase,
  type LockedGrid,
  type SavedInScene,
  type SceneTransaction,
} from './locked-scene';
import type { SceneRow, ScenesDao } from './scenes.dao';

/** What a board transaction on the cast and a grid needs: both locks and both versions. */
export type CastLockDaos = Readonly<{
  scenes: Pick<ScenesDao, 'lockCastOf' | 'lockInCampaign' | 'bumpVersion'>;
}>;

/** The grid of the command and, when locked, the table's cast (the scene of the anchors). */
export type LockedCastAndGrid<Daos> = LockedGrid<Daos> & Readonly<{ cast: SceneRow }>;
export type LockedGridMaybeCast<Daos> = LockedGrid<Daos> & Readonly<{ cast: SceneRow | null }>;

/** What a work changed: each scene it touched gets a new version (and its event). */
export type CastAndGridChange<T> = Readonly<{ value: T; grid: boolean; cast: boolean }>;
export type SavedVersion = Readonly<{ sceneId: string; version: number }>;

/** What the transaction saved, the version of each scene it touched (`null` = untouched) and the
 *  version a command answers: the grid's, else the cast's, else the grid's as it was. */
export type SavedInCastAndGrid<T> = Readonly<{
  value: T;
  grid: SavedVersion | null;
  cast: SavedVersion | null;
  version: number;
}>;

/** What a transaction on the table's pieces (card, condition list) needs: the cast lock alone. */
export type CastOnlyLockDaos = Readonly<{ scenes: Pick<ScenesDao, 'lockCastOf' | 'bumpVersion'> }>;
export type LockedCast<Daos> = Readonly<{ daos: Daos; cast: SceneRow }>;
/** What a work on the cast saved and whether it changed it (a change gets a new version). */
export type CastChange<T> = Readonly<{ value: T; changed: boolean }>;

// The work met a linked token without the cast locked: it rolls back and runs again with it.
class CastLockNeeded extends Error {
  constructor(readonly campaignId: string) {
    super(`the command on campaign ${campaignId} touches an anchor; it runs again with the cast`);
  }
}

/** Lock the cast → lock the addressed grid (checking the requester reaches it) → work → bump what
 *  it touched (the cast first), in one transaction. The cast is always locked before any grid, so
 *  two commands never wait on each other.
 *
 *  Example: `await inLockedCastAndGrid(transaction, address, async ({ daos, scene, cast }) => ({ value, grid: true, cast: true }))` */
export async function inLockedCastAndGrid<Daos extends CastLockDaos, T>(
  transaction: SceneTransaction<Daos>,
  address: GridAddress,
  work: (locked: LockedCastAndGrid<Daos>) => Promise<CastAndGridChange<T>>,
): Promise<SavedInCastAndGrid<T>> {
  return transaction(async (daos) => {
    const cast = castSceneOf(address.campaignId, await daos.scenes.lockCastOf(address.campaignId));
    const row = await daos.scenes.lockInCampaign(address.campaignId, address.sceneId);
    const scene = reachedGridOf(address, row);
    return savedOf(daos, scene, cast, await work({ daos, scene, cast }));
  });
}

/** Like `inLockedCastAndGrid`, but the cast is locked only when the work needs it: a first run
 *  locks just the grid, and a work that meets a linked token (`requireCastLock`) is rolled back
 *  and run again with the cast locked first. Commands on unlinked tokens never touch the cast.
 *
 *  Example: `await inLockedGridWithCast(transaction, address, async (locked) => { … })` */
export async function inLockedGridWithCast<Daos extends CastLockDaos, T>(
  transaction: SceneTransaction<Daos>,
  address: GridAddress,
  work: (locked: LockedGridMaybeCast<Daos>) => Promise<CastAndGridChange<T>>,
): Promise<SavedInCastAndGrid<T>> {
  try {
    return await transaction(async (daos) => {
      const row = await daos.scenes.lockInCampaign(address.campaignId, address.sceneId);
      const scene = reachedGridOf(address, row);
      return savedOf(daos, scene, null, await work({ daos, scene, cast: null }));
    });
  } catch (error) {
    if (!(error instanceof CastLockNeeded)) throw error;
    return inLockedCastAndGrid(transaction, address, work);
  }
}

/** The cast of a work that touches an anchor; without its lock, the run starts again with it.
 *  Call it before the first write.
 *
 *  Example: `const cast = requireCastLock(locked)` */
export function requireCastLock(locked: LockedGridMaybeCast<unknown>): SceneRow {
  if (locked.cast) return locked.cast;
  throw new CastLockNeeded(locked.scene.campaignId);
}

/** Lock the table's cast → work → bump it when the work changed it, in one transaction. For what
 *  is the table's and not of one grid: it orders with the anchors' events, whatever grid is the
 *  group's. The requester's membership is checked before (the cast is every member's).
 *
 *  Example: `await inLockedCast(transaction, campaignId, async ({ daos }) => ({ value, changed: true }))` */
export async function inLockedCast<Daos extends CastOnlyLockDaos, T>(
  transaction: SceneTransaction<Daos>,
  campaignId: string,
  work: (locked: LockedCast<Daos>) => Promise<CastChange<T>>,
): Promise<SavedInScene<T>> {
  return transaction(async (daos) => {
    const cast = castSceneOf(campaignId, await daos.scenes.lockCastOf(campaignId));
    const { value, changed } = await work({ daos, cast });
    const version = changed ? await daos.scenes.bumpVersion(cast.id) : cast.version;
    return { value, version, sceneId: cast.id };
  });
}

/** The opening of an event of one scene the transaction touched.
 *
 *  Example: `if (saved.cast) publisher.tokenChanged({ ...castEventBase(campaignId, saved.cast, clock), … })` */
export function savedEventBase(
  campaignId: string,
  saved: SavedVersion,
  clock: ClockPort,
): GridEventBase {
  return { campaignId, ...saved, at: clock.now().toISOString() };
}

async function savedOf<T>(
  daos: CastLockDaos,
  scene: SceneRow,
  cast: SceneRow | null,
  change: CastAndGridChange<T>,
): Promise<SavedInCastAndGrid<T>> {
  const castSaved = change.cast ? await bumped(daos, requireLocked(cast, scene)) : null;
  const grid = change.grid ? await bumped(daos, scene) : null;
  const version = grid?.version ?? castSaved?.version ?? scene.version;
  return { value: change.value, grid, cast: castSaved, version };
}

async function bumped(daos: CastLockDaos, scene: SceneRow): Promise<SavedVersion> {
  return { sceneId: scene.id, version: await daos.scenes.bumpVersion(scene.id) };
}

function requireLocked(cast: SceneRow | null, scene: SceneRow): SceneRow {
  if (cast) return cast;
  throw new Error(`a work on scene ${scene.id} touched the cast without calling requireCastLock`);
}

function castSceneOf(campaignId: string, cast: SceneRow | undefined): SceneRow {
  if (cast) return cast;
  throw new Error(`campaign ${campaignId} has no cast; every campaign has one`);
}
