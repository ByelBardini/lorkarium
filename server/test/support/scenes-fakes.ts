import type { AddressedSceneRow, SceneRow, ScenesDao } from '../../src/modules/scenes/scenes.dao';
import type { SceneTransactionRunner } from '../../src/modules/scenes/scenes.service';
import type { NewScenePo, SceneConfigPo, ScenePo } from '../../src/modules/scenes/scenes.po';
import { AssetsDaoFake } from './assets-fakes';
import { scenePo } from './scenes-factories';

/** In-memory scenes table. `activeOf` maps a campaign to its active scene (the
 *  `campaigns.active_scene_id` of the real query); `journal` records lock, update and bump in order
 *  (`lockInCampaign` of an addressed grid writes `lockInCampaign:<id>`; of the group grid, `lock`).
 *  `backgrounds` holds the pixels of each background asset id (the join of the real query). */
export class ScenesDaoFake implements Pick<
  ScenesDao,
  | 'insert'
  | 'findActiveOf'
  | 'lockActiveOf'
  | 'lockInCampaign'
  | 'shareInCampaign'
  | 'findGridInCampaign'
  | 'findCastOf'
  | 'lockCastOf'
  | 'bumpVersion'
  | 'update'
> {
  readonly journal: string[] = [];
  readonly activeOf = new Map<string, string>();
  readonly backgrounds = new Map<string, { width: number; height: number }>();

  constructor(readonly rows: ScenePo[] = []) {}

  async insert(scene: NewScenePo): Promise<ScenePo> {
    const row = scenePo({ id: `scene-${this.rows.length + 1}`, version: 0, ...scene });
    this.rows.push(row);
    return row;
  }

  async findActiveOf(campaignId: string): Promise<SceneRow | undefined> {
    const sceneId = this.activeOf.get(campaignId);
    const row = this.rows.find((each) => each.id === sceneId && each.campaignId === campaignId);
    return row && this.withBackground(row);
  }

  async lockActiveOf(campaignId: string): Promise<SceneRow | undefined> {
    this.journal.push('lock');
    return this.findActiveOf(campaignId);
  }

  async lockInCampaign(
    campaignId: string,
    sceneId?: string,
  ): Promise<AddressedSceneRow | undefined> {
    this.journal.push(sceneId === undefined ? 'lock' : `lockInCampaign:${sceneId}`);
    return this.addressed(campaignId, sceneId);
  }

  async findGridInCampaign(
    campaignId: string,
    sceneId?: string,
  ): Promise<AddressedSceneRow | undefined> {
    return this.addressed(campaignId, sceneId);
  }

  async shareInCampaign(
    campaignId: string,
    sceneId: string,
  ): Promise<AddressedSceneRow | undefined> {
    this.journal.push(`share:${sceneId}`);
    return this.addressed(campaignId, sceneId);
  }

  async findCastOf(campaignId: string): Promise<SceneRow | undefined> {
    const row = this.rows.find((each) => each.campaignId === campaignId && each.kind === 'cast');
    return row && this.withBackground(row);
  }

  async lockCastOf(campaignId: string): Promise<SceneRow | undefined> {
    this.journal.push('lock cast');
    return this.findCastOf(campaignId);
  }

  /** Writes `bump` for a grid and `bump cast` for the cast. */
  async bumpVersion(sceneId: string): Promise<number> {
    const row = this.rowOf(sceneId);
    this.journal.push(row.kind === 'cast' ? 'bump cast' : 'bump');
    row.version += 1;
    return row.version;
  }

  async update(sceneId: string, config: SceneConfigPo): Promise<ScenePo> {
    this.journal.push('save');
    const row = this.rowOf(sceneId);
    Object.assign(row, config);
    return { ...row };
  }

  /** Makes a grid public or private, as the library's PATCH would. */
  setVisibility(sceneId: string, visibility: ScenePo['visibility']): void {
    this.rowOf(sceneId).visibility = visibility;
  }

  private addressed(campaignId: string, sceneId?: string): AddressedSceneRow | undefined {
    const activeId = this.activeOf.get(campaignId);
    const wanted = sceneId ?? activeId;
    const row = this.rows.find((each) => each.id === wanted && each.campaignId === campaignId);
    return row && { ...this.withBackground(row), isActive: row.id === activeId };
  }

  private withBackground(row: ScenePo): SceneRow {
    const pixels = row.backgroundAssetId ? this.backgrounds.get(row.backgroundAssetId) : undefined;
    return {
      ...row,
      backgroundWidth: pixels?.width ?? null,
      backgroundHeight: pixels?.height ?? null,
    };
  }

  private rowOf(sceneId: string): ScenePo {
    const row = this.rows.find((candidate) => candidate.id === sceneId);
    if (!row) throw new Error(`ScenesDaoFake has no scene ${sceneId}`);
    return row;
  }
}

export { BoardPublisherFake } from './board-publisher-fake';

/** Runs the work on the fake DAO and writes 'commit' to its journal once the work resolves. */
export class SceneTransactionRunnerFake {
  constructor(
    private readonly scenes: ScenesDaoFake,
    private readonly assets: AssetsDaoFake = new AssetsDaoFake(),
  ) {}

  readonly run: SceneTransactionRunner = async (work) => {
    const result = await work({ scenes: this.scenes, assets: this.assets });
    this.scenes.journal.push('commit');
    return result;
  };
}
