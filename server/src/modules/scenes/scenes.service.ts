import type { SceneBackgroundDto, SceneVisionDto } from '@lorkarium/contracts';
import { isProtectedAssetPurpose } from '../assets/asset-upload.bo';
import type { AssetsDao } from '../assets/assets.dao';
import { AssetNotFoundError } from '../assets/assets.error';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { toCampaignAccessBo } from '../campaigns/campaigns.mapper';
import type { BoardPublisherPort } from './board-publisher.port';
import { gridPlanLockOf, inLockedGrid, requireEditableGrid } from './locked-scene';
import { SceneConfigBo, changesGridSetup, type SceneGrid } from './scene-config.bo';
import type { AddressedSceneRow, SceneRow, ScenesDao } from './scenes.dao';
import { backgroundOfScene, toSceneDto, toSceneGridPo, toSceneSetup } from './scenes.mapper';

/** The DAOs a transaction hands out, bound to the open `tx`. */
export type SceneWriteDaos = Readonly<{
  scenes: Pick<ScenesDao, 'lockInCampaign' | 'update' | 'bumpVersion' | 'rankOf'>;
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
  freeMovement?: boolean | undefined;
  sceneId?: string | undefined;
}>;

/** Configures the grid, the background and the vision mode of one grid of a campaign (absent
 *  `sceneId` = the group grid): persists, bumps that grid's version, then publishes. A grid past
 *  the owner's plan keeps its size, ruler and background (PLAN_LIMIT `readOnly`); its vision mode
 *  and free movement still change.
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
    const scene = toSceneDto(saved.value.row, saved.value.planLocked);
    const { version, sceneId } = saved;
    this.deps.publisher.sceneUpdated({ campaignId, sceneId, version, at, scene });
    return version;
  }
}

/** The saved grid and whether it is past the owner's plan (the `planLocked` of `scene:updated`). */
type ConfiguredGrid = Readonly<{ row: SceneRow; planLocked: boolean }>;

async function savedConfigOf(
  daos: SceneWriteDaos,
  scene: AddressedSceneRow,
  grid: SceneGrid,
  request: SceneConfigRequest,
): Promise<ConfiguredGrid> {
  const changesSetup = changesGridSetup(toSceneSetup(scene), grid, request.backgroundAssetId);
  const planLocked = await planLockOfConfigure(daos.scenes, scene, changesSetup);
  const background = await backgroundFor(daos.assets, scene, request.backgroundAssetId);
  const config = {
    ...toSceneGridPo(grid),
    backgroundAssetId: background?.assetId ?? null,
    visionMode: request.vision ?? scene.visionMode,
    freeMovement: request.freeMovement ?? scene.freeMovement,
  };
  const { hiddenByFolder } = scene;
  const saved = await daos.scenes.update(scene.id, config);
  return { row: { ...saved, ...pixelsOf(background), hiddenByFolder }, planLocked };
}

// One rank per configure: a change of setup is refused past the plan (so it was not locked); a
// vision or free movement alone only reads whether it is.
async function planLockOfConfigure(
  scenes: SceneWriteDaos['scenes'],
  scene: AddressedSceneRow,
  changesSetup: boolean,
): Promise<boolean> {
  if (!changesSetup) return gridPlanLockOf(scenes, scene);
  await requireEditableGrid(scenes, scene);
  return false;
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
  if (!asset || isProtectedAssetPurpose(asset.purpose)) throw new AssetNotFoundError(choice);
  return { assetId: asset.id, width: asset.width, height: asset.height };
}

function pixelsOf(background: Background): Pick<SceneRow, 'backgroundWidth' | 'backgroundHeight'> {
  return {
    backgroundWidth: background?.width ?? null,
    backgroundHeight: background?.height ?? null,
  };
}
