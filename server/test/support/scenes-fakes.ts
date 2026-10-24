import type {
  CombatEndedDto,
  CombatStartedDto,
  CombatTurnChangedDto,
  CombatUpdatedDto,
  ConditionAppliedDto,
  ConditionsAppliedDto,
  ConditionDefinedDto,
  ConditionDefinitionUpdatedDto,
  ConditionDefinitionDeletedDto,
  ConditionDefaultsRestoredDto,
  ConditionRemovedDto,
  ConditionsChangedDto,
  DrawingsCreatedDto,
  DrawingsDeletedDto,
  DrawingsMovedDto,
  EffectAreasCreatedDto,
  EffectAreasDeletedDto,
  EffectAreasReshapedDto,
  DoorChangedDto,
  LightColorsChangedDto,
  LightConesChangedDto,
  LightRangesChangedDto,
  LightsCreatedDto,
  LightsDeletedDto,
  LightsLitChangedDto,
  LightsMovedDto,
  WallSegmentErasedDto,
  WallAreaErasedDto,
  WallKindsChangedDto,
  WallsCreatedDto,
  WallsDeletedDto,
  WallsMovedDto,
  SceneUpdatedDto,
  TokenDeletedDto,
  TokenLayerChangedDto,
  TokensDeletedDto,
  TokensDraggedDto,
  TokensFacedDto,
  TokensMovedDto,
  TokensRestyledDto,
  TokensResizedDto,
  MainTokenChangedDto,
  MemberCardChangedDto,
  TokenMovedDto,
} from '@lorkarium/contracts';
import type {
  BoardPublisherPort,
  TokenChange,
  TokensCreation,
} from '../../src/modules/scenes/board-publisher.port';
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

/** Records every published board event; writes 'publish' to the shared journal to prove the order. */
export class BoardPublisherFake implements BoardPublisherPort {
  readonly sceneUpdates: SceneUpdatedDto[] = [];

  constructor(private readonly journal: string[] = []) {}

  readonly tokenChanges: TokenChange[] = [];
  readonly tokenMoves: TokenMovedDto[] = [];
  readonly tokenDeletes: TokenDeletedDto[] = [];
  readonly tokenLayerChanges: TokenLayerChangedDto[] = [];
  readonly tokensFacings: TokensFacedDto[] = [];
  readonly tokensRestylings: TokensRestyledDto[] = [];
  readonly tokensResizes: TokensResizedDto[] = [];
  readonly mainTokenChanges: MainTokenChangedDto[] = [];
  readonly memberCardChanges: MemberCardChangedDto[] = [];
  readonly tokensMoves: TokensMovedDto[] = [];
  readonly tokensCreations: TokensCreation[] = [];
  readonly tokensDeletes: TokensDeletedDto[] = [];
  readonly tokensDrags: Array<Readonly<{ event: TokensDraggedDto; exceptConnectionId: string }>> =
    [];
  readonly combatEvents: Array<
    | Readonly<{ name: 'combat:started'; event: CombatStartedDto }>
    | Readonly<{ name: 'combat:updated'; event: CombatUpdatedDto }>
    | Readonly<{ name: 'combat:turnChanged'; event: CombatTurnChangedDto }>
    | Readonly<{ name: 'combat:ended'; event: CombatEndedDto }>
  > = [];
  readonly conditionEvents: Array<ConditionDefinedDto | ConditionAppliedDto | ConditionRemovedDto> =
    [];
  readonly conditionsApplies: ConditionsAppliedDto[] = [];
  readonly catalogEvents: Array<
    | Readonly<{ name: 'condition:definitionUpdated'; event: ConditionDefinitionUpdatedDto }>
    | Readonly<{ name: 'condition:definitionDeleted'; event: ConditionDefinitionDeletedDto }>
    | Readonly<{ name: 'condition:defaultsRestored'; event: ConditionDefaultsRestoredDto }>
  > = [];
  readonly conditionsChanges: ConditionsChangedDto[] = [];
  readonly drawingsCreates: DrawingsCreatedDto[] = [];
  readonly drawingsMoves: DrawingsMovedDto[] = [];
  readonly drawingsDeletes: DrawingsDeletedDto[] = [];
  readonly effectAreasCreates: EffectAreasCreatedDto[] = [];
  readonly effectAreasReshapes: EffectAreasReshapedDto[] = [];
  readonly effectAreasDeletes: EffectAreasDeletedDto[] = [];
  readonly wallsCreates: WallsCreatedDto[] = [];
  readonly wallsMoves: WallsMovedDto[] = [];
  readonly wallsDeletes: WallsDeletedDto[] = [];
  readonly wallKindChanges: WallKindsChangedDto[] = [];
  readonly doorChanges: DoorChangedDto[] = [];
  readonly wallSegmentErasures: WallSegmentErasedDto[] = [];
  readonly wallAreaErasures: WallAreaErasedDto[] = [];
  readonly lightsCreates: LightsCreatedDto[] = [];
  readonly lightsMoves: LightsMovedDto[] = [];
  readonly lightRangeChanges: LightRangesChangedDto[] = [];
  readonly lightColorChanges: LightColorsChangedDto[] = [];
  readonly lightConeChanges: LightConesChangedDto[] = [];
  readonly lightLitChanges: LightsLitChangedDto[] = [];
  readonly lightsDeletes: LightsDeletedDto[] = [];

  sceneUpdated(event: SceneUpdatedDto): void {
    this.journal.push('publish');
    this.sceneUpdates.push(event);
  }

  tokenChanged(change: TokenChange): void {
    this.journal.push('publish');
    this.tokenChanges.push(change);
  }

  tokenMoved(event: TokenMovedDto): void {
    this.journal.push('publish');
    this.tokenMoves.push(event);
  }

  tokenDeleted(event: TokenDeletedDto): void {
    this.journal.push('publish');
    this.tokenDeletes.push(event);
  }

  tokensCreated(creation: TokensCreation): void {
    this.journal.push('publish');
    this.tokensCreations.push(creation);
  }

  tokensDeleted(event: TokensDeletedDto): void {
    this.journal.push('publish');
    this.tokensDeletes.push(event);
  }

  mainTokenChanged(event: MainTokenChangedDto): void {
    this.journal.push('publish');
    this.mainTokenChanges.push(event);
  }

  memberCardChanged(event: MemberCardChangedDto): void {
    this.journal.push('publish');
    this.memberCardChanges.push(event);
  }

  tokensMoved(event: TokensMovedDto): void {
    this.journal.push('publish');
    this.tokensMoves.push(event);
  }

  tokensDragged(event: TokensDraggedDto, exceptConnectionId: string): void {
    this.journal.push('publish');
    this.tokensDrags.push({ event, exceptConnectionId });
  }

  tokenLayerChanged(event: TokenLayerChangedDto): void {
    this.journal.push('publish');
    this.tokenLayerChanges.push(event);
  }

  tokensFaced(event: TokensFacedDto): void {
    this.journal.push('publish');
    this.tokensFacings.push(event);
  }

  tokensRestyled(event: TokensRestyledDto): void {
    this.journal.push('publish');
    this.tokensRestylings.push(event);
  }

  tokensResized(event: TokensResizedDto): void {
    this.journal.push('publish');
    this.tokensResizes.push(event);
  }

  drawingsCreated(event: DrawingsCreatedDto): void {
    this.journal.push('publish');
    this.drawingsCreates.push(event);
  }

  drawingsMoved(event: DrawingsMovedDto): void {
    this.journal.push('publish');
    this.drawingsMoves.push(event);
  }

  drawingsDeleted(event: DrawingsDeletedDto): void {
    this.journal.push('publish');
    this.drawingsDeletes.push(event);
  }

  effectAreasCreated(event: EffectAreasCreatedDto): void {
    this.journal.push('publish');
    this.effectAreasCreates.push(event);
  }

  effectAreasReshaped(event: EffectAreasReshapedDto): void {
    this.journal.push('publish');
    this.effectAreasReshapes.push(event);
  }

  effectAreasDeleted(event: EffectAreasDeletedDto): void {
    this.journal.push('publish');
    this.effectAreasDeletes.push(event);
  }

  wallsCreated(event: WallsCreatedDto): void {
    this.journal.push('publish');
    this.wallsCreates.push(event);
  }

  wallsMoved(event: WallsMovedDto): void {
    this.journal.push('publish');
    this.wallsMoves.push(event);
  }

  wallsDeleted(event: WallsDeletedDto): void {
    this.journal.push('publish');
    this.wallsDeletes.push(event);
  }

  wallKindsChanged(event: WallKindsChangedDto): void {
    this.journal.push('publish');
    this.wallKindChanges.push(event);
  }

  doorChanged(event: DoorChangedDto): void {
    this.journal.push('publish');
    this.doorChanges.push(event);
  }

  wallSegmentErased(event: WallSegmentErasedDto): void {
    this.journal.push('publish');
    this.wallSegmentErasures.push(event);
  }

  wallAreaErased(event: WallAreaErasedDto): void {
    this.journal.push('publish');
    this.wallAreaErasures.push(event);
  }

  lightsCreated(event: LightsCreatedDto): void {
    this.journal.push('publish');
    this.lightsCreates.push(event);
  }

  lightsMoved(event: LightsMovedDto): void {
    this.journal.push('publish');
    this.lightsMoves.push(event);
  }

  lightRangesChanged(event: LightRangesChangedDto): void {
    this.journal.push('publish');
    this.lightRangeChanges.push(event);
  }

  lightColorsChanged(event: LightColorsChangedDto): void {
    this.journal.push('publish');
    this.lightColorChanges.push(event);
  }

  lightConesChanged(event: LightConesChangedDto): void {
    this.journal.push('publish');
    this.lightConeChanges.push(event);
  }

  lightsLitChanged(event: LightsLitChangedDto): void {
    this.journal.push('publish');
    this.lightLitChanges.push(event);
  }

  lightsDeleted(event: LightsDeletedDto): void {
    this.journal.push('publish');
    this.lightsDeletes.push(event);
  }

  conditionDefined(event: ConditionDefinedDto): void {
    this.journal.push('publish');
    this.conditionEvents.push(event);
  }

  conditionDefinitionUpdated(event: ConditionDefinitionUpdatedDto): void {
    this.journal.push('publish');
    this.catalogEvents.push({ name: 'condition:definitionUpdated', event });
  }

  conditionDefinitionDeleted(event: ConditionDefinitionDeletedDto): void {
    this.journal.push('publish');
    this.catalogEvents.push({ name: 'condition:definitionDeleted', event });
  }

  conditionDefaultsRestored(event: ConditionDefaultsRestoredDto): void {
    this.journal.push('publish');
    this.catalogEvents.push({ name: 'condition:defaultsRestored', event });
  }

  conditionApplied(event: ConditionAppliedDto): void {
    this.journal.push('publish');
    this.conditionEvents.push(event);
  }

  conditionsApplied(event: ConditionsAppliedDto): void {
    this.journal.push('publish');
    this.conditionsApplies.push(event);
  }

  conditionRemoved(event: ConditionRemovedDto): void {
    this.journal.push('publish');
    this.conditionEvents.push(event);
  }

  conditionsChanged(event: ConditionsChangedDto): void {
    this.journal.push('publish');
    this.conditionsChanges.push(event);
  }

  combatStarted(event: CombatStartedDto): void {
    this.journal.push('publish');
    this.combatEvents.push({ name: 'combat:started', event });
  }

  combatUpdated(event: CombatUpdatedDto): void {
    this.journal.push('publish');
    this.combatEvents.push({ name: 'combat:updated', event });
  }

  combatTurnChanged(event: CombatTurnChangedDto): void {
    this.journal.push('publish');
    this.combatEvents.push({ name: 'combat:turnChanged', event });
  }

  combatEnded(event: CombatEndedDto): void {
    this.journal.push('publish');
    this.combatEvents.push({ name: 'combat:ended', event });
  }

  /** How many events went out, of any kind. */
  get published(): number {
    return (
      this.sceneUpdates.length +
      this.tokenChanges.length +
      this.tokenMoves.length +
      this.tokenDeletes.length +
      this.tokenLayerChanges.length +
      this.tokensMoves.length +
      this.tokensCreations.length +
      this.tokensDeletes.length +
      this.tokensDrags.length +
      this.conditionEvents.length +
      this.conditionsApplies.length +
      this.catalogEvents.length +
      this.drawingsCreates.length +
      this.drawingsMoves.length +
      this.drawingsDeletes.length +
      this.combatEvents.length
    );
  }
}

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
