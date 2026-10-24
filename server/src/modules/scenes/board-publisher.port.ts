import type {
  MainTokenChangedDto,
  MemberCardChangedDto,
  CombatDto,
  CombatEndedDto,
  CombatStartedDto,
  CombatTurnChangedDto,
  CombatUpdatedDto,
  ConditionAppliedDto,
  ConditionsAppliedDto,
  ConditionDefinedDto,
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

/** An event of one grid: the publisher sends it to that grid's rooms, so `sceneId` is required
 *  here even while the DTO keeps it optional. */
export type GridEvent<Event> = Event & Readonly<{ sceneId: string }>;

/** A token event in its two versions: whole for the masters and the token's controllers,
 *  redacted for everyone else at the table (spec §3.9). */
export type TokenChange = Readonly<{
  name: 'token:created' | 'token:updated';
  campaignId: string;
  sceneId: string;
  controllerIds: readonly string[];
  privileged: GridEvent<TokenCreatedDto | TokenUpdatedDto>;
  others: GridEvent<TokenCreatedDto | TokenUpdatedDto>;
}>;

/** A paste of tokens: each one whole for the masters and its controllers, redacted for the rest. */
export type TokensCreation = Readonly<{
  campaignId: string;
  sceneId: string;
  version: number;
  at: string;
  tokens: ReadonlyArray<
    Readonly<{ controllerIds: readonly string[]; privileged: TokenDto; others: TokenDto }>
  >;
  combat: CombatDto | null;
}>;

/** Sends a confirmed board change to who has its grid open; called only after the commit. */
export interface BoardPublisherPort {
  sceneUpdated(event: SceneUpdatedDto): void;
  tokenChanged(change: TokenChange): void;
  tokenMoved(event: GridEvent<TokenMovedDto>): void;
  tokensMoved(event: GridEvent<TokensMovedDto>): void;
  /** A drag preview (one token is a group of one): nothing was saved. `exceptConnectionId` is
   *  the dragger, who draws it locally. */
  tokensDragged(event: GridEvent<TokensDraggedDto>, exceptConnectionId: string): void;
  tokenDeleted(event: GridEvent<TokenDeletedDto>): void;
  tokensCreated(creation: TokensCreation): void;
  tokensDeleted(event: GridEvent<TokensDeletedDto>): void;
  tokenLayerChanged(event: GridEvent<TokenLayerChangedDto>): void;
  /** The facing and the look are not secrets: the whole table gets the same events. */
  tokensFaced(event: GridEvent<TokensFacedDto>): void;
  tokensRestyled(event: GridEvent<TokensRestyledDto>): void;
  /** The size is not a secret either. */
  tokensResized(event: GridEvent<TokensResizedDto>): void;
  /** A person's main token: not a secret, everyone with the grid open gets it. */
  mainTokenChanged(event: GridEvent<MainTokenChangedDto>): void;
  /** A member's card on the party board: not a secret; it goes to the group grid. */
  memberCardChanged(event: GridEvent<MemberCardChangedDto>): void;
  /** Drawings have no secret: the whole table gets the same events. */
  drawingsCreated(event: GridEvent<DrawingsCreatedDto>): void;
  drawingsMoved(event: GridEvent<DrawingsMovedDto>): void;
  drawingsDeleted(event: GridEvent<DrawingsDeletedDto>): void;
  /** Areas of effect have no secret either. */
  effectAreasCreated(event: GridEvent<EffectAreasCreatedDto>): void;
  effectAreasReshaped(event: GridEvent<EffectAreasReshapedDto>): void;
  effectAreasDeleted(event: GridEvent<EffectAreasDeletedDto>): void;
  /** Walls go to the whole table: the player's client needs them for the fog and the route. */
  wallsCreated(event: GridEvent<WallsCreatedDto>): void;
  wallsMoved(event: GridEvent<WallsMovedDto>): void;
  wallsDeleted(event: GridEvent<WallsDeletedDto>): void;
  wallKindsChanged(event: GridEvent<WallKindsChangedDto>): void;
  doorChanged(event: GridEvent<DoorChangedDto>): void;
  wallSegmentErased(event: GridEvent<WallSegmentErasedDto>): void;
  wallAreaErased(event: GridEvent<WallAreaErasedDto>): void;
  /** Map lights go to the whole table too: the player's client needs them for the fog (only the
   *  master's board draws the icon). */
  lightsCreated(event: GridEvent<LightsCreatedDto>): void;
  lightsMoved(event: GridEvent<LightsMovedDto>): void;
  lightRangesChanged(event: GridEvent<LightRangesChangedDto>): void;
  lightColorsChanged(event: GridEvent<LightColorsChangedDto>): void;
  lightConesChanged(event: GridEvent<LightConesChangedDto>): void;
  lightsLitChanged(event: GridEvent<LightsLitChangedDto>): void;
  lightsDeleted(event: GridEvent<LightsDeletedDto>): void;
  conditionDefined(event: GridEvent<ConditionDefinedDto>): void;
  conditionApplied(event: GridEvent<ConditionAppliedDto>): void;
  conditionsApplied(event: GridEvent<ConditionsAppliedDto>): void;
  conditionRemoved(event: GridEvent<ConditionRemovedDto>): void;
  /** The anchors' conditions after the end of a turn of tokens linked to them, to the cast. */
  conditionsChanged(event: GridEvent<ConditionsChangedDto>): void;
  combatStarted(event: GridEvent<CombatStartedDto>): void;
  combatUpdated(event: GridEvent<CombatUpdatedDto>): void;
  combatTurnChanged(event: GridEvent<CombatTurnChangedDto>): void;
  combatEnded(event: GridEvent<CombatEndedDto>): void;
}
