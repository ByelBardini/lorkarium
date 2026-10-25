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
  TokensCreatedDto,
  TokensHiddenChangedDto,
  VeiledLightDto,
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

/** Who one cut of a veiled event goes to, inside the event's grid: the masters; one controller of
 *  a hidden token (their room, without the masters); or everyone else (the grid without the
 *  masters and those controllers). */
export type VeilAudience =
  | Readonly<{ kind: 'masters' }>
  | Readonly<{ kind: 'controller'; userId: string }>
  | Readonly<{ kind: 'rest'; controllerIds: readonly string[] }>;

/** What one audience receives of an event that touched a hidden token; `null` = nothing of it is
 *  theirs: they get `board:advanced` (an event without version, a drag, gets nothing). */
export type VeiledCut<Event> = Readonly<{ audience: VeilAudience; event: Event | null }>;

/** One cut per audience; none (`NO_VEIL`) = the event touched no hidden token and goes whole to
 *  the grid, exactly as before the veil. */
export type VeilCuts<Event> = readonly VeiledCut<Event>[];

/** A token change of a hidden token: the cuts (the redacted version is never sent), and the
 *  `token:deleted` of each one who stopped controlling it. */
export type TokenChangeVeil = Readonly<{
  cuts: VeilCuts<GridEvent<TokenCreatedDto | TokenUpdatedDto>>;
  lost: ReadonlyArray<Readonly<{ userId: string; event: GridEvent<TokenDeletedDto> }>>;
}>;

/** What one audience receives when tokens hide or show: the flag, to who keeps seeing them; the
 *  tokens leaving or arriving, to who stops or starts. */
export type HiddenCut = Readonly<{ audience: VeilAudience }> &
  (
    | Readonly<{ name: 'token:hiddenChanged'; event: GridEvent<TokensHiddenChangedDto> }>
    | Readonly<{ name: 'token:deletedMany'; event: GridEvent<TokensDeletedDto> }>
    | Readonly<{ name: 'token:createdMany'; event: GridEvent<TokensCreatedDto> }>
  );

export type TokensHiddenChange = Readonly<{
  campaignId: string;
  sceneId: string;
  cuts: readonly HiddenCut[];
}>;

/** The whole list of veiled lights of each audience whose list changed. */
export type VeiledLightsChange = Readonly<{
  campaignId: string;
  sceneId: string;
  at: string;
  cuts: ReadonlyArray<Readonly<{ audience: VeilAudience; lights: readonly VeiledLightDto[] }>>;
}>;

/** Sends a confirmed board change to who has its grid open; called only after the commit. Every
 *  event that may name a token takes its veil: the cuts of who may not see some of it. */
export interface BoardPublisherPort {
  sceneUpdated(event: SceneUpdatedDto): void;
  tokenChanged(change: TokenChange, veil: TokenChangeVeil): void;
  tokenMoved(event: GridEvent<TokenMovedDto>, veil: VeilCuts<GridEvent<TokenMovedDto>>): void;
  tokensMoved(event: GridEvent<TokensMovedDto>, veil: VeilCuts<GridEvent<TokensMovedDto>>): void;
  /** A drag preview (one token is a group of one): nothing was saved. `exceptConnectionId` is
   *  the dragger, who draws it locally. */
  tokensDragged(
    event: GridEvent<TokensDraggedDto>,
    exceptConnectionId: string,
    veil: VeilCuts<GridEvent<TokensDraggedDto>>,
  ): void;
  tokenDeleted(event: GridEvent<TokenDeletedDto>, veil: VeilCuts<GridEvent<TokenDeletedDto>>): void;
  /** Without a veil each controller gets their own mix (see the adapter); with one, the cuts are
   *  that mix already, without what each audience may not see. */
  tokensCreated(creation: TokensCreation, veil: VeilCuts<GridEvent<TokensCreatedDto>>): void;
  tokensDeleted(
    event: GridEvent<TokensDeletedDto>,
    veil: VeilCuts<GridEvent<TokensDeletedDto>>,
  ): void;
  /** Hidden or shown tokens: always cut (see `HiddenCut`). */
  tokensHiddenChanged(change: TokensHiddenChange): void;
  /** No version, like a drag: each audience gets its whole new list. */
  veiledLightsChanged(change: VeiledLightsChange): void;
  tokenLayerChanged(
    event: GridEvent<TokenLayerChangedDto>,
    veil: VeilCuts<GridEvent<TokenLayerChangedDto>>,
  ): void;
  /** The facing and the look are not secrets: the whole table gets the same events. */
  tokensFaced(event: GridEvent<TokensFacedDto>, veil: VeilCuts<GridEvent<TokensFacedDto>>): void;
  tokensRestyled(
    event: GridEvent<TokensRestyledDto>,
    veil: VeilCuts<GridEvent<TokensRestyledDto>>,
  ): void;
  /** The size is not a secret either. */
  tokensResized(
    event: GridEvent<TokensResizedDto>,
    veil: VeilCuts<GridEvent<TokensResizedDto>>,
  ): void;
  /** A person's main token: not a secret, everyone with the grid open gets it. */
  mainTokenChanged(
    event: GridEvent<MainTokenChangedDto>,
    veil: VeilCuts<GridEvent<MainTokenChangedDto>>,
  ): void;
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
  /** The table's list changed: the three go to the cast's rooms (every member), like the define. */
  conditionDefinitionUpdated(event: GridEvent<ConditionDefinitionUpdatedDto>): void;
  conditionDefinitionDeleted(event: GridEvent<ConditionDefinitionDeletedDto>): void;
  conditionDefaultsRestored(event: GridEvent<ConditionDefaultsRestoredDto>): void;
  conditionApplied(
    event: GridEvent<ConditionAppliedDto>,
    veil: VeilCuts<GridEvent<ConditionAppliedDto>>,
  ): void;
  conditionsApplied(
    event: GridEvent<ConditionsAppliedDto>,
    veil: VeilCuts<GridEvent<ConditionsAppliedDto>>,
  ): void;
  conditionRemoved(
    event: GridEvent<ConditionRemovedDto>,
    veil: VeilCuts<GridEvent<ConditionRemovedDto>>,
  ): void;
  /** The anchors' conditions after the end of a turn of tokens linked to them, to the cast. */
  conditionsChanged(event: GridEvent<ConditionsChangedDto>): void;
  combatStarted(
    event: GridEvent<CombatStartedDto>,
    veil: VeilCuts<GridEvent<CombatStartedDto>>,
  ): void;
  combatUpdated(
    event: GridEvent<CombatUpdatedDto>,
    veil: VeilCuts<GridEvent<CombatUpdatedDto>>,
  ): void;
  combatTurnChanged(
    event: GridEvent<CombatTurnChangedDto>,
    veil: VeilCuts<GridEvent<CombatTurnChangedDto>>,
  ): void;
  combatEnded(event: GridEvent<CombatEndedDto>): void;
}
