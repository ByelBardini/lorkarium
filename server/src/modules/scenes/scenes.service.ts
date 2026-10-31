import type { SceneBackgroundDto, SceneVisionDto } from '@lorkarium/contracts';
import type { AssetsDao } from '../assets/assets.dao';
import { AssetNotFoundError } from '../assets/assets.error';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { toCampaignAccessBo } from '../campaigns/campaigns.mapper';
import type { BoardPublisherPort } from './board-publisher.port';
import { inLockedGrid } from './locked-scene';
import { SceneConfigBo, type SceneGrid } from './scene-config.bo';
import type { SceneRow, ScenesDao } from './scenes.dao';
import { backgroundOfScene, toSceneDto, toSceneGridPo } from './scenes.mapper';

/** The DAOs a transaction hands out, bound to the open `tx`. */
export type SceneWriteDaos = Readonly<{
  scenes: Pick<ScenesDao, 'lockInCampaign' | 'update' | 'bumpVersion'>;
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
/** The vision mode a configure asks for; absent keeps the scene's. */
export type VisionChoice = SceneVisionDto | undefined;

/** What a `scene:configure` asks for: the grid, the background and vision choices, and the grid
 *  it is addressed to (absent = the group grid). */
export type SceneConfigRequest = Readonly<{
  grid: SceneGrid;
  backgroundAssetId?: BackgroundChoice;
  vision?: VisionChoice;
  sceneId?: string | undefined;
}>;

/** Configures the grid, the background and the vision mode of one grid of a campaign (absent
 *  `sceneId` = the group grid): persists, bumps that grid's version, then publishes.
 *
 *  Example: `const version = await scenesService.configure(user.id, campaignId, { grid, sceneId })` */
export class ScenesService {
  constructor(private readonly deps: ScenesServiceDeps) {}

  async configure(
    userId: string,
    campaignId: string,
    request: SceneConfigRequest,
  ): Promise<number> {
    const membership = await this.deps.members.findMembership(campaignId, userId);
    const access = toCampaignAccessBo(campaignId, userId, membership);
    access.requireMember();
    const address = { campaignId, sceneId: request.sceneId, access };
    // The grid is reached before the master rule: a player's private grid is SCENE_NOT_FOUND.
    const saved = await inLockedGrid(this.deps.transaction, address, ({ daos, scene }) =>
      savedConfigOf(daos, scene, new SceneConfigBo(access).configure(request.grid), request),
    );
    const at = this.deps.clock.now().toISOString();
    const scene = toSceneDto(saved.value);
    const { version, sceneId } = saved;
    this.deps.publisher.sceneUpdated({ campaignId, sceneId, version, at, scene });
    return version;
  }
}

async function savedConfigOf(
  daos: SceneWriteDaos,
  scene: SceneRow,
  grid: SceneGrid,
  request: SceneConfigRequest,
): Promise<SceneRow> {
  const background = await backgroundFor(daos.assets, scene, request.backgroundAssetId);
  const config = {
    ...toSceneGridPo(grid),
    backgroundAssetId: background?.assetId ?? null,
    visionMode: request.vision ?? scene.visionMode,
  };
  return { ...(await daos.scenes.update(scene.id, config)), ...pixelsOf(background) };
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
  if (!asset || asset.purpose === 'library_image' || asset.purpose === 'document_image')
    throw new AssetNotFoundError(choice);
  return { assetId: asset.id, width: asset.width, height: asset.height };
}

function pixelsOf(background: Background): Pick<SceneRow, 'backgroundWidth' | 'backgroundHeight'> {
  return {
    backgroundWidth: background?.width ?? null,
    backgroundHeight: background?.height ?? null,
  };
}
