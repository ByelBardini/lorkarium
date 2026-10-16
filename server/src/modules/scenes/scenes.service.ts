import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { toCampaignAccessBo } from '../campaigns/campaigns.mapper';
import type { BoardPublisherPort } from './board-publisher.port';
import { SceneConfigBo, type SceneGrid } from './scene-config.bo';
import type { ScenesDao } from './scenes.dao';
import { toSceneDto, toSceneGridPo } from './scenes.mapper';
import type { ScenePo } from './scenes.po';

/** The DAOs a transaction hands out, bound to the open `tx`. */
export type SceneWriteDaos = Readonly<{
  scenes: Pick<ScenesDao, 'lockActiveOf' | 'update' | 'bumpVersion'>;
}>;

export type SceneTransactionRunner = <T>(work: (daos: SceneWriteDaos) => Promise<T>) => Promise<T>;

export type ScenesServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: SceneTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

/** Configures the grid of a campaign's active scene: persists, bumps the version, then publishes.
 *
 *  Example: `const version = await scenesService.configure(user.id, campaignId, grid)` */
export class ScenesService {
  constructor(private readonly deps: ScenesServiceDeps) {}

  async configure(userId: string, campaignId: string, grid: SceneGrid): Promise<number> {
    const membership = await this.deps.members.findMembership(campaignId, userId);
    const access = toCampaignAccessBo(campaignId, userId, membership);
    const decided = new SceneConfigBo(access).configure(grid);
    const saved = await this.deps.transaction(async ({ scenes }) => {
      const scene = await lockedSceneOf(scenes, campaignId);
      const updated = await scenes.update(scene.id, toSceneGridPo(decided));
      return { ...updated, version: await scenes.bumpVersion(scene.id) };
    });
    const at = this.deps.clock.now().toISOString();
    const scene = toSceneDto(saved);
    this.deps.publisher.sceneUpdated({ campaignId, version: saved.version, at, scene });
    return saved.version;
  }
}

async function lockedSceneOf(
  scenes: SceneWriteDaos['scenes'],
  campaignId: string,
): Promise<ScenePo> {
  const scene = await scenes.lockActiveOf(campaignId);
  if (!scene) throw new Error(`campaign ${campaignId} has no active scene; every campaign has one`);
  return scene;
}
