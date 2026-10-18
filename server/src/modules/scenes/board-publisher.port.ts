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
  TokenCreatedDto,
  TokenDeletedDto,
  TokenLayerChangedDto,
  TokenMovedDto,
  TokenDto,
  TokenUpdatedDto,
  TokensDeletedDto,
  TokensResizedDto,
  TokensDraggedDto,
  TokensFacedDto,
  TokensMovedDto,
  TokensRestyledDto,
} from '@lorkarium/contracts';

/** A token event in its two versions: whole for the masters and the token's controllers,
 *  redacted for everyone else at the table (spec §3.9). */
export type TokenChange = Readonly<{
  name: 'token:created' | 'token:updated';
  campaignId: string;
  controllerIds: readonly string[];
  privileged: TokenCreatedDto | TokenUpdatedDto;
  others: TokenCreatedDto | TokenUpdatedDto;
}>;

/** A paste of tokens: each one whole for the masters and its controllers, redacted for the rest. */
export type TokensCreation = Readonly<{
  campaignId: string;
  version: number;
  at: string;
  tokens: ReadonlyArray<
    Readonly<{ controllerIds: readonly string[]; privileged: TokenDto; others: TokenDto }>
  >;
}>;

/** Sends a confirmed board change to the table; called only after the transaction committed. */
export interface BoardPublisherPort {
  sceneUpdated(event: SceneUpdatedDto): void;
  tokenChanged(change: TokenChange): void;
  tokenMoved(event: TokenMovedDto): void;
  tokensMoved(event: TokensMovedDto): void;
  /** A drag preview (one token is a group of one): nothing was saved. `exceptConnectionId` is
   *  the dragger, who draws it locally. */
  tokensDragged(event: TokensDraggedDto, exceptConnectionId: string): void;
  tokenDeleted(event: TokenDeletedDto): void;
  tokensCreated(creation: TokensCreation): void;
  tokensDeleted(event: TokensDeletedDto): void;
  tokenLayerChanged(event: TokenLayerChangedDto): void;
  /** The facing and the look are not secrets: the whole table gets the same events. */
  tokensFaced(event: TokensFacedDto): void;
  tokensRestyled(event: TokensRestyledDto): void;
  /** The size is not a secret either. */
  tokensResized(event: TokensResizedDto): void;
  /** Drawings have no secret: the whole table gets the same events. */
  drawingsCreated(event: DrawingsCreatedDto): void;
  drawingsMoved(event: DrawingsMovedDto): void;
  drawingsDeleted(event: DrawingsDeletedDto): void;
  /** Areas of effect have no secret either. */
  effectAreasCreated(event: EffectAreasCreatedDto): void;
  effectAreasReshaped(event: EffectAreasReshapedDto): void;
  effectAreasDeleted(event: EffectAreasDeletedDto): void;
  /** Walls go to the whole table: the player's client needs them for the fog and the route. */
  wallsCreated(event: WallsCreatedDto): void;
  wallsMoved(event: WallsMovedDto): void;
  wallsDeleted(event: WallsDeletedDto): void;
  wallKindsChanged(event: WallKindsChangedDto): void;
  doorChanged(event: DoorChangedDto): void;
  wallSegmentErased(event: WallSegmentErasedDto): void;
  wallAreaErased(event: WallAreaErasedDto): void;
  conditionDefined(event: ConditionDefinedDto): void;
  conditionApplied(event: ConditionAppliedDto): void;
  conditionsApplied(event: ConditionsAppliedDto): void;
  conditionRemoved(event: ConditionRemovedDto): void;
  combatStarted(event: CombatStartedDto): void;
  combatUpdated(event: CombatUpdatedDto): void;
  combatTurnChanged(event: CombatTurnChangedDto): void;
  combatEnded(event: CombatEndedDto): void;
}
