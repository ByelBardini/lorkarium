import type { SceneBackgroundDto } from '@lorkarium/contracts';
import type { AssetsDao } from '../assets/assets.dao';
import { AssetNotFoundError } from '../assets/assets.error';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { toCampaignAccessBo } from '../campaigns/campaigns.mapper';
import type { BoardPublisherPort } from './board-publisher.port';
import { SceneConfigBo, type SceneGrid } from './scene-config.bo';
import type { SceneRow, ScenesDao } from './scenes.dao';
import { backgroundOfScene, toSceneDto, toSceneGridPo } from './scenes.mapper';

/** The DAOs a transaction hands out, bound to the open `tx`. */
export type SceneWriteDaos = Readonly<{
  scenes: Pick<ScenesDao, 'lockActiveOf' | 'update' | 'bumpVersion'>;
  assets: Pick<AssetsDao, 'findInCampaign'>;
}>;

export type SceneTransactionRunner = <T>(work: (daos: SceneWriteDaos) => Promise<T>) => Promise<T>;

export type ScenesServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: SceneTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

/** The background a configure asks for: an asset id sets it, `null` takes it away, absent keeps. */
export type BackgroundChoice = string | null | undefined;

type Background = SceneBackgroundDto | null;

/** Configures the grid and the background of a campaign's active scene: persists, bumps the
 *  version, then publishes.
 *
 *  Example: `const version = await scenesService.configure(user.id, campaignId, grid, assetId)` */
export class ScenesService {
  constructor(private readonly deps: ScenesServiceDeps) {}

  async configure(
    userId: string,
    campaignId: string,
    grid: SceneGrid,
    backgroundAssetId?: BackgroundChoice,
  ): Promise<number> {
    const membership = await this.deps.members.findMembership(campaignId, userId);
    const access = toCampaignAccessBo(campaignId, userId, membership);
    const decided = new SceneConfigBo(access).configure(grid);
    const saved = await this.deps.transaction(async ({ scenes, assets }) => {
      const scene = await lockedSceneOf(scenes, campaignId);
      const background = await backgroundFor(assets, scene, backgroundAssetId);
      const config = { ...toSceneGridPo(decided), backgroundAssetId: background?.assetId ?? null };
      const updated = await scenes.update(scene.id, config);
      const version = await scenes.bumpVersion(scene.id);
      return { ...updated, ...pixelsOf(background), version };
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
): Promise<SceneRow> {
  const scene = await scenes.lockActiveOf(campaignId);
  if (!scene) throw new Error(`campaign ${campaignId} has no active scene; every campaign has one`);
  return scene;
}

// Only an asset of the scene's own campaign may become its background (§2.6).
async function backgroundFor(
  assets: SceneWriteDaos['assets'],
  scene: SceneRow,
  choice: BackgroundChoice,
): Promise<Background> {
  if (choice === undefined) return backgroundOfScene(scene);
  if (choice === null) return null;
  const asset = await assets.findInCampaign(scene.campaignId, choice);
  if (!asset) throw new AssetNotFoundError(choice);
  return { assetId: asset.id, width: asset.width, height: asset.height };
}

function pixelsOf(background: Background): Pick<SceneRow, 'backgroundWidth' | 'backgroundHeight'> {
  return {
    backgroundWidth: background?.width ?? null,
    backgroundHeight: background?.height ?? null,
  };
}
