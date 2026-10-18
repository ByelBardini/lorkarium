import type {
  CombatEndedDto,
  CombatStartedDto,
  CombatTurnChangedDto,
  CombatUpdatedDto,
  ConditionAppliedDto,
  ConditionsAppliedDto,
  ConditionDefinedDto,
  ConditionRemovedDto,
  DrawingsCreatedDto,
  DrawingsDeletedDto,
  DrawingsMovedDto,
  EffectAreasCreatedDto,
  EffectAreasDeletedDto,
  EffectAreasReshapedDto,
  DoorChangedDto,
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
  TokenMovedDto,
} from '@lorkarium/contracts';
import type {
  BoardPublisherPort,
  TokenChange,
  TokensCreation,
} from '../../src/modules/scenes/board-publisher.port';
import type { SceneRow, ScenesDao } from '../../src/modules/scenes/scenes.dao';
import type { SceneTransactionRunner } from '../../src/modules/scenes/scenes.service';
import type { NewScenePo, SceneConfigPo, ScenePo } from '../../src/modules/scenes/scenes.po';
import { AssetsDaoFake } from './assets-fakes';
import { scenePo } from './scenes-factories';

/** In-memory scenes table. `activeOf` maps a campaign to its active scene (the
 *  `campaigns.active_scene_id` of the real query); `journal` records lock, update and bump in order.
 *  `backgrounds` holds the pixels of each background asset id (the join of the real query). */
export class ScenesDaoFake implements Pick<
  ScenesDao,
  'insert' | 'findActiveOf' | 'lockActiveOf' | 'bumpVersion' | 'update'
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

  async bumpVersion(sceneId: string): Promise<number> {
    this.journal.push('bump');
    const row = this.rowOf(sceneId);
    row.version += 1;
    return row.version;
  }

  async update(sceneId: string, config: SceneConfigPo): Promise<ScenePo> {
    this.journal.push('save');
    const row = this.rowOf(sceneId);
    Object.assign(row, config);
    return { ...row };
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

  conditionDefined(event: ConditionDefinedDto): void {
    this.journal.push('publish');
    this.conditionEvents.push(event);
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
