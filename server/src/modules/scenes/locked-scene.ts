import type { ScenesDao } from './scenes.dao';
import type { ScenePo } from './scenes.po';

/** What every board transaction needs: the scene lock and its version. */
export type SceneLockDaos = Readonly<{ scenes: Pick<ScenesDao, 'lockActiveOf' | 'bumpVersion'> }>;

export type SceneTransaction<Daos> = <T>(work: (daos: Daos) => Promise<T>) => Promise<T>;
export type LockedScene<Daos> = Readonly<{ daos: Daos; scene: ScenePo }>;
export type SavedInScene<T> = Readonly<{ value: T; version: number }>;
/** What a creating command answers: the version and the ids given, in the order sent. */
export type CreatedInScene = Readonly<{ version: number; createdIds: string[] }>;

/** Lock the active scene → work → bump the version, in one transaction (spec §5.5); the caller
 *  publishes after it resolved, that is, after the commit. A work that throws bumps nothing.
 *
 *  Example: `const saved = await inLockedScene(transaction, campaignId, ({ daos, scene }) => …)` */
export async function inLockedScene<Daos extends SceneLockDaos, T>(
  transaction: SceneTransaction<Daos>,
  campaignId: string,
  work: (locked: LockedScene<Daos>) => Promise<T>,
): Promise<SavedInScene<T>> {
  return transaction(async (daos) => {
    const scene = activeSceneOf(campaignId, await daos.scenes.lockActiveOf(campaignId));
    const value = await work({ daos, scene });
    return { value, version: await daos.scenes.bumpVersion(scene.id) };
  });
}

/** The scene read for a campaign; every campaign has one, so a missing scene is a broken table.
 *
 *  Example: `activeSceneOf(campaignId, await scenes.findActiveOf(campaignId))` */
export function activeSceneOf(campaignId: string, scene: ScenePo | undefined): ScenePo {
  if (scene) return scene;
  throw new Error(`campaign ${campaignId} has no active scene; every campaign has one`);
}
