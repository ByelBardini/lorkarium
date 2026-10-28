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
  TokenFormChangedDto,
  MainTokenChangedDto,
  MemberCardChangedDto,
  TokenMovedDto,
} from '@lorkarium/contracts';
import type {
  BoardPublisherPort,
  TokenChange,
  TokenChangeVeil,
  TokensCreation,
  TokensHiddenChange,
  VeilCuts,
  VeiledLightsChange,
} from '../../src/modules/scenes/board-publisher.port';

/** Records every published board event; writes 'publish' to the shared journal to prove the order. */
export class BoardPublisherFake implements BoardPublisherPort {
  readonly sceneUpdates: SceneUpdatedDto[] = [];

  constructor(private readonly journal: string[] = []) {}

  readonly tokenChanges: TokenChange[] = [];
  /** The calls that came with a veil (a hidden token touched), by method. */
  readonly veils: Array<Readonly<{ method: string; cuts: VeilCuts<unknown> }>> = [];
  readonly tokenChangeVeils: TokenChangeVeil[] = [];
  readonly tokensHiddenChanges: TokensHiddenChange[] = [];
  readonly veiledLightsChanges: VeiledLightsChange[] = [];
  readonly tokenMoves: TokenMovedDto[] = [];
  readonly tokenDeletes: TokenDeletedDto[] = [];
  readonly tokenLayerChanges: TokenLayerChangedDto[] = [];
  readonly tokensFacings: TokensFacedDto[] = [];
  readonly tokensRestylings: TokensRestyledDto[] = [];
  readonly tokensResizes: TokensResizedDto[] = [];
  readonly tokenFormChanges: TokenFormChangedDto[] = [];
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

  tokensHiddenChanged(change: TokensHiddenChange): void {
    this.journal.push('publish');
    this.tokensHiddenChanges.push(change);
  }

  veiledLightsChanged(change: VeiledLightsChange): void {
    this.journal.push('publishLights');
    this.veiledLightsChanges.push(change);
  }

  /** The veil of the last call of `method`, if it had one. */
  veilOf(method: string): VeilCuts<unknown> | undefined {
    return this.veils.findLast((call) => call.method === method)?.cuts;
  }

  private remember(method: string, cuts: VeilCuts<unknown>): void {
    if (cuts.length > 0) this.veils.push({ method, cuts });
  }

  sceneUpdated(event: SceneUpdatedDto): void {
    this.journal.push('publish');
    this.sceneUpdates.push(event);
  }

  tokenChanged(change: TokenChange, veil: TokenChangeVeil): void {
    this.journal.push('publish');
    this.remember('tokenChanged', veil.cuts);
    this.tokenChangeVeils.push(veil);
    this.tokenChanges.push(change);
  }

  tokenMoved(event: TokenMovedDto, veil: VeilCuts<unknown>): void {
    this.journal.push('publish');
    this.remember('tokenMoved', veil);
    this.tokenMoves.push(event);
  }

  tokenDeleted(event: TokenDeletedDto, veil: VeilCuts<unknown>): void {
    this.journal.push('publish');
    this.remember('tokenDeleted', veil);
    this.tokenDeletes.push(event);
  }

  tokensCreated(creation: TokensCreation, veil: VeilCuts<unknown>): void {
    this.journal.push('publish');
    this.remember('tokensCreated', veil);
    this.tokensCreations.push(creation);
  }

  tokensDeleted(event: TokensDeletedDto, veil: VeilCuts<unknown>): void {
    this.journal.push('publish');
    this.remember('tokensDeleted', veil);
    this.tokensDeletes.push(event);
  }

  mainTokenChanged(event: MainTokenChangedDto, veil: VeilCuts<unknown>): void {
    this.journal.push('publish');
    this.remember('mainTokenChanged', veil);
    this.mainTokenChanges.push(event);
  }

  memberCardChanged(event: MemberCardChangedDto): void {
    this.journal.push('publish');
    this.memberCardChanges.push(event);
  }

  tokensMoved(event: TokensMovedDto, veil: VeilCuts<unknown>): void {
    this.journal.push('publish');
    this.remember('tokensMoved', veil);
    this.tokensMoves.push(event);
  }

  tokensDragged(
    event: TokensDraggedDto,
    exceptConnectionId: string,
    veil: VeilCuts<unknown>,
  ): void {
    this.journal.push('publish');
    this.remember('tokensDragged', veil);
    this.tokensDrags.push({ event, exceptConnectionId });
  }

  tokenLayerChanged(event: TokenLayerChangedDto, veil: VeilCuts<unknown>): void {
    this.journal.push('publish');
    this.remember('tokenLayerChanged', veil);
    this.tokenLayerChanges.push(event);
  }

  tokensFaced(event: TokensFacedDto, veil: VeilCuts<unknown>): void {
    this.journal.push('publish');
    this.remember('tokensFaced', veil);
    this.tokensFacings.push(event);
  }

  tokensRestyled(event: TokensRestyledDto, veil: VeilCuts<unknown>): void {
    this.journal.push('publish');
    this.remember('tokensRestyled', veil);
    this.tokensRestylings.push(event);
  }

  tokensResized(event: TokensResizedDto, veil: VeilCuts<unknown>): void {
    this.journal.push('publish');
    this.remember('tokensResized', veil);
    this.tokensResizes.push(event);
  }

  tokenFormChanged(event: TokenFormChangedDto, veil: VeilCuts<unknown>): void {
    this.journal.push('publish');
    this.remember('tokenFormChanged', veil);
    this.tokenFormChanges.push(event);
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

  conditionApplied(event: ConditionAppliedDto, veil: VeilCuts<unknown>): void {
    this.journal.push('publish');
    this.remember('conditionApplied', veil);
    this.conditionEvents.push(event);
  }

  conditionsApplied(event: ConditionsAppliedDto, veil: VeilCuts<unknown>): void {
    this.journal.push('publish');
    this.remember('conditionsApplied', veil);
    this.conditionsApplies.push(event);
  }

  conditionRemoved(event: ConditionRemovedDto, veil: VeilCuts<unknown>): void {
    this.journal.push('publish');
    this.remember('conditionRemoved', veil);
    this.conditionEvents.push(event);
  }

  conditionsChanged(event: ConditionsChangedDto): void {
    this.journal.push('publish');
    this.conditionsChanges.push(event);
  }

  combatStarted(event: CombatStartedDto, veil: VeilCuts<unknown>): void {
    this.journal.push('publish');
    this.remember('combatStarted', veil);
    this.combatEvents.push({ name: 'combat:started', event });
  }

  combatUpdated(event: CombatUpdatedDto, veil: VeilCuts<unknown>): void {
    this.journal.push('publish');
    this.remember('combatUpdated', veil);
    this.combatEvents.push({ name: 'combat:updated', event });
  }

  combatTurnChanged(event: CombatTurnChangedDto, veil: VeilCuts<unknown>): void {
    this.journal.push('publish');
    this.remember('combatTurnChanged', veil);
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
