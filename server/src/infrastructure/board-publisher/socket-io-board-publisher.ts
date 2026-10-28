import type {
  MainTokenChangedDto,
  MemberCardChangedDto,
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
  TokensResizedDto,
  TokenFormChangedDto,
  SceneUpdatedDto,
  TokenDeletedDto,
  TokenLayerChangedDto,
  TokenMovedDto,
  TokensDeletedDto,
  TokensDraggedDto,
  TokensFacedDto,
  TokensMovedDto,
  TokensRestyledDto,
  TableServerEvents,
  TokensCreatedDto,
  BoardAdvancedDto,
} from '@lorkarium/contracts';
import type {
  BoardPublisherPort,
  GridEvent,
  TokenChange,
  TokenChangeVeil,
  TokensCreation,
  TokensHiddenChange,
  VeilAudience,
  VeilCuts,
  VeiledLightsChange,
} from '../../modules/scenes/board-publisher.port';
import type { RealtimeServer } from '../../realtime/realtime-server';
import { sceneMastersRoom, sceneRoom, sceneUserRoom } from '../../realtime/rooms';

/** Emits each confirmed board change to the rooms of its grid, and only there (spec §2.6): who
 *  has that grid open. A token goes whole to the masters and its controllers, and redacted to
 *  the rest.
 *
 *  Example: `new SocketIoBoardPublisher(realtime.io).tokenChanged(change)` */
export class SocketIoBoardPublisher implements BoardPublisherPort {
  constructor(private readonly io: RealtimeServer) {}

  // Only who has this grid open hears it: a private grid in preparation reaches no player.
  sceneUpdated(event: SceneUpdatedDto): void {
    this.io.to(sceneRoom(event.campaignId, event.scene.id)).emit('scene:updated', event);
  }

  // A hidden token: whole to the masters and its controllers, `board:advanced` to the rest, and
  // `token:deleted` to who stopped controlling it.
  tokenChanged(change: TokenChange, veil: TokenChangeVeil): void {
    if (veil.cuts.length > 0) {
      this.emitCuts(change.name, change.privileged, veil.cuts);
      for (const { userId, event } of veil.lost)
        this.audience(event, { kind: 'controller', userId }).emit('token:deleted', event);
      return;
    }
    const { campaignId, sceneId } = change;
    const privilegedRooms = [
      sceneMastersRoom(campaignId, sceneId),
      ...change.controllerIds.map((userId) => sceneUserRoom(campaignId, sceneId, userId)),
    ];
    this.io.to(privilegedRooms).emit(change.name, change.privileged);
    this.io
      .to(sceneRoom(campaignId, sceneId))
      .except(privilegedRooms)
      .emit(change.name, change.others);
  }

  tokenMoved(event: GridEvent<TokenMovedDto>, veil: VeilCuts<GridEvent<TokenMovedDto>>): void {
    this.emitCuts('token:moved', event, veil);
  }

  tokensMoved(event: GridEvent<TokensMovedDto>, veil: VeilCuts<GridEvent<TokensMovedDto>>): void {
    this.emitCuts('token:movedMany', event, veil);
  }

  // Every socket is in a room named by its own id: leaving it out skips the dragger's echo.
  tokensDragged(
    event: GridEvent<TokensDraggedDto>,
    exceptConnectionId: string,
    veil: VeilCuts<GridEvent<TokensDraggedDto>>,
  ): void {
    this.emitCuts('token:draggedMany', event, veil, exceptConnectionId);
  }

  tokenDeleted(
    event: GridEvent<TokenDeletedDto>,
    veil: VeilCuts<GridEvent<TokenDeletedDto>>,
  ): void {
    this.emitCuts('token:deleted', event, veil);
  }

  // Each controller gets their own mix (whole for theirs, redacted for the rest); a master who
  // also controls a token only hears the masters' cut, so nobody hears the paste twice. With a
  // veil, the cuts are those mixes already, without what each audience may not see.
  tokensCreated(creation: TokensCreation, veil: VeilCuts<GridEvent<TokensCreatedDto>>): void {
    const { campaignId, sceneId, tokens, combat } = creation;
    const base = { campaignId, sceneId, version: creation.version, at: creation.at, combat };
    const whole = { ...base, tokens: tokens.map((token) => token.privileged) };
    this.emitCuts('token:createdMany', whole, veil.length > 0 ? veil : mixesOf(base, tokens));
  }

  tokensDeleted(
    event: GridEvent<TokensDeletedDto>,
    veil: VeilCuts<GridEvent<TokensDeletedDto>>,
  ): void {
    this.emitCuts('token:deletedMany', event, veil);
  }

  tokensHiddenChanged(change: TokensHiddenChange): void {
    for (const cut of change.cuts) {
      const to = this.audience(change, cut.audience);
      if (cut.name === 'token:hiddenChanged') to.emit(cut.name, cut.event);
      else if (cut.name === 'token:deletedMany') to.emit(cut.name, cut.event);
      else to.emit(cut.name, cut.event);
    }
  }

  veiledLightsChanged(change: VeiledLightsChange): void {
    const { campaignId, sceneId, at } = change;
    for (const { audience, lights } of change.cuts) {
      const event = { campaignId, sceneId, at, lights: [...lights] };
      this.audience(change, audience).emit('token:veiledLightsChanged', event);
    }
  }

  // The layer is not a secret: everyone with the grid open gets the same event.
  tokenLayerChanged(
    event: GridEvent<TokenLayerChangedDto>,
    veil: VeilCuts<GridEvent<TokenLayerChangedDto>>,
  ): void {
    this.emitCuts('token:layerChanged', event, veil);
  }

  tokensFaced(event: GridEvent<TokensFacedDto>, veil: VeilCuts<GridEvent<TokensFacedDto>>): void {
    this.emitCuts('token:facedMany', event, veil);
  }

  tokensRestyled(
    event: GridEvent<TokensRestyledDto>,
    veil: VeilCuts<GridEvent<TokensRestyledDto>>,
  ): void {
    this.emitCuts('token:restyledMany', event, veil);
  }

  tokensResized(
    event: GridEvent<TokensResizedDto>,
    veil: VeilCuts<GridEvent<TokensResizedDto>>,
  ): void {
    this.emitCuts('token:resizedMany', event, veil);
  }

  tokenFormChanged(
    event: GridEvent<TokenFormChangedDto>,
    veil: VeilCuts<GridEvent<TokenFormChangedDto>>,
  ): void {
    this.emitCuts('token:formChanged', event, veil);
  }

  mainTokenChanged(
    event: GridEvent<MainTokenChangedDto>,
    veil: VeilCuts<GridEvent<MainTokenChangedDto>>,
  ): void {
    this.emitCuts('token:mainChanged', event, veil);
  }

  memberCardChanged(event: GridEvent<MemberCardChangedDto>): void {
    this.io.to(gridRoomOf(event)).emit('member:cardChanged', event);
  }

  // A drawing is not a secret: the layer only decides who picks it up, not who sees it.
  drawingsCreated(event: GridEvent<DrawingsCreatedDto>): void {
    this.io.to(gridRoomOf(event)).emit('drawing:createdMany', event);
  }

  drawingsMoved(event: GridEvent<DrawingsMovedDto>): void {
    this.io.to(gridRoomOf(event)).emit('drawing:movedMany', event);
  }

  drawingsDeleted(event: GridEvent<DrawingsDeletedDto>): void {
    this.io.to(gridRoomOf(event)).emit('drawing:deletedMany', event);
  }

  // An area of effect is a template everyone at the table reads: nothing to redact.
  effectAreasCreated(event: GridEvent<EffectAreasCreatedDto>): void {
    this.io.to(gridRoomOf(event)).emit('effectArea:createdMany', event);
  }

  effectAreasReshaped(event: GridEvent<EffectAreasReshapedDto>): void {
    this.io.to(gridRoomOf(event)).emit('effectArea:reshapedMany', event);
  }

  effectAreasDeleted(event: GridEvent<EffectAreasDeletedDto>): void {
    this.io.to(gridRoomOf(event)).emit('effectArea:deletedMany', event);
  }

  wallsCreated(event: GridEvent<WallsCreatedDto>): void {
    this.io.to(gridRoomOf(event)).emit('wall:createdMany', event);
  }

  wallsMoved(event: GridEvent<WallsMovedDto>): void {
    this.io.to(gridRoomOf(event)).emit('wall:movedMany', event);
  }

  wallsDeleted(event: GridEvent<WallsDeletedDto>): void {
    this.io.to(gridRoomOf(event)).emit('wall:deletedMany', event);
  }

  wallKindsChanged(event: GridEvent<WallKindsChangedDto>): void {
    this.io.to(gridRoomOf(event)).emit('wall:kindsChanged', event);
  }

  doorChanged(event: GridEvent<DoorChangedDto>): void {
    this.io.to(gridRoomOf(event)).emit('wall:doorChanged', event);
  }

  wallSegmentErased(event: GridEvent<WallSegmentErasedDto>): void {
    this.io.to(gridRoomOf(event)).emit('wall:segmentErased', event);
  }

  wallAreaErased(event: GridEvent<WallAreaErasedDto>): void {
    this.io.to(gridRoomOf(event)).emit('wall:areaErased', event);
  }

  lightsCreated(event: GridEvent<LightsCreatedDto>): void {
    this.io.to(gridRoomOf(event)).emit('light:createdMany', event);
  }

  lightsMoved(event: GridEvent<LightsMovedDto>): void {
    this.io.to(gridRoomOf(event)).emit('light:movedMany', event);
  }

  lightRangesChanged(event: GridEvent<LightRangesChangedDto>): void {
    this.io.to(gridRoomOf(event)).emit('light:rangesChanged', event);
  }

  lightColorsChanged(event: GridEvent<LightColorsChangedDto>): void {
    this.io.to(gridRoomOf(event)).emit('light:colorsChanged', event);
  }

  lightConesChanged(event: GridEvent<LightConesChangedDto>): void {
    this.io.to(gridRoomOf(event)).emit('light:conesChanged', event);
  }

  lightsLitChanged(event: GridEvent<LightsLitChangedDto>): void {
    this.io.to(gridRoomOf(event)).emit('light:litChanged', event);
  }

  lightsDeleted(event: GridEvent<LightsDeletedDto>): void {
    this.io.to(gridRoomOf(event)).emit('light:deletedMany', event);
  }

  // Conditions are on the token for everyone to see: nothing to redact (spec §3.7).
  conditionDefined(event: GridEvent<ConditionDefinedDto>): void {
    this.io.to(gridRoomOf(event)).emit('condition:defined', event);
  }

  conditionDefinitionUpdated(event: GridEvent<ConditionDefinitionUpdatedDto>): void {
    this.io.to(gridRoomOf(event)).emit('condition:definitionUpdated', event);
  }

  conditionDefinitionDeleted(event: GridEvent<ConditionDefinitionDeletedDto>): void {
    this.io.to(gridRoomOf(event)).emit('condition:definitionDeleted', event);
  }

  conditionDefaultsRestored(event: GridEvent<ConditionDefaultsRestoredDto>): void {
    this.io.to(gridRoomOf(event)).emit('condition:defaultsRestored', event);
  }

  conditionApplied(
    event: GridEvent<ConditionAppliedDto>,
    veil: VeilCuts<GridEvent<ConditionAppliedDto>>,
  ): void {
    this.emitCuts('condition:applied', event, veil);
  }

  conditionsApplied(
    event: GridEvent<ConditionsAppliedDto>,
    veil: VeilCuts<GridEvent<ConditionsAppliedDto>>,
  ): void {
    this.emitCuts('condition:appliedMany', event, veil);
  }

  conditionRemoved(
    event: GridEvent<ConditionRemovedDto>,
    veil: VeilCuts<GridEvent<ConditionRemovedDto>>,
  ): void {
    this.emitCuts('condition:removed', event, veil);
  }

  conditionsChanged(event: GridEvent<ConditionsChangedDto>): void {
    this.io.to(gridRoomOf(event)).emit('condition:changedMany', event);
  }

  combatStarted(
    event: GridEvent<CombatStartedDto>,
    veil: VeilCuts<GridEvent<CombatStartedDto>>,
  ): void {
    this.emitCuts('combat:started', event, veil);
  }

  combatUpdated(
    event: GridEvent<CombatUpdatedDto>,
    veil: VeilCuts<GridEvent<CombatUpdatedDto>>,
  ): void {
    this.emitCuts('combat:updated', event, veil);
  }

  combatTurnChanged(
    event: GridEvent<CombatTurnChangedDto>,
    veil: VeilCuts<GridEvent<CombatTurnChangedDto>>,
  ): void {
    this.emitCuts('combat:turnChanged', event, veil);
  }

  combatEnded(event: GridEvent<CombatEndedDto>): void {
    this.io.to(gridRoomOf(event)).emit('combat:ended', event);
  }
  // Without a veil, the grid gets the event whole, as it always did; with one, each audience its
  // cut, and an audience left with nothing of a versioned event gets `board:advanced`.
  private emitCuts<Name extends VeiledEventName>(
    name: Name,
    event: EventOf<Name> & GridAddress,
    cuts: VeilCuts<EventOf<Name>>,
    exceptConnectionId?: string,
  ): void {
    if (cuts.length === 0) {
      this.without(this.io.to(gridRoomOf(event)), exceptConnectionId).emit(
        name,
        ...argsOf(name, event),
      );
      return;
    }
    for (const cut of cuts) {
      const to = this.without(this.audience(event, cut.audience), exceptConnectionId);
      if (cut.event) to.emit(name, ...argsOf(name, cut.event));
      else if ('version' in event) to.emit('board:advanced', advancedOf(event));
    }
  }

  // The rooms of one audience of a grid (`VeilAudience`).
  private audience(address: GridAddress, audience: VeilAudience): BroadcastTo {
    const { campaignId, sceneId } = address;
    const masters = sceneMastersRoom(campaignId, sceneId);
    if (audience.kind === 'masters') return this.io.to(masters);
    if (audience.kind === 'controller')
      return this.io.to(sceneUserRoom(campaignId, sceneId, audience.userId)).except(masters);
    const controllers = audience.controllerIds.map((id) => sceneUserRoom(campaignId, sceneId, id));
    return this.io.to(sceneRoom(campaignId, sceneId)).except([masters, ...controllers]);
  }

  private without(to: BroadcastTo, connectionId: string | undefined): BroadcastTo {
    return connectionId === undefined ? to : to.except(connectionId);
  }
}

type GridAddress = Readonly<{ campaignId: string; sceneId: string }>;
type BroadcastTo = ReturnType<RealtimeServer['to']>;
type VeiledEventName =
  | 'token:created'
  | 'token:updated'
  | 'token:moved'
  | 'token:movedMany'
  | 'token:draggedMany'
  | 'token:deleted'
  | 'token:createdMany'
  | 'token:deletedMany'
  | 'token:layerChanged'
  | 'token:facedMany'
  | 'token:restyledMany'
  | 'token:resizedMany'
  | 'token:formChanged'
  | 'token:mainChanged'
  | 'condition:applied'
  | 'condition:appliedMany'
  | 'condition:removed'
  | 'combat:started'
  | 'combat:updated'
  | 'combat:turnChanged';
type EventOf<Name extends VeiledEventName> = Parameters<TableServerEvents[Name]>[0];

// The one payload of a typed event, as the typed `emit` takes it.
function argsOf<Name extends VeiledEventName>(
  _name: Name,
  event: EventOf<Name>,
): Parameters<TableServerEvents[Name]> {
  return [event] as Parameters<TableServerEvents[Name]>;
}

function advancedOf(
  event: GridAddress & Readonly<{ version: number; at: string }>,
): BoardAdvancedDto {
  const { campaignId, sceneId, version, at } = event;
  return { campaignId, sceneId, version, at };
}

// The paste as today: the masters whole, each controller their mix, the rest redacted.
function mixesOf(
  base: Omit<GridEvent<TokensCreatedDto>, 'tokens'>,
  tokens: TokensCreation['tokens'],
): VeilCuts<GridEvent<TokensCreatedDto>> {
  const controllerIds = [...new Set(tokens.flatMap((token) => token.controllerIds))];
  const mixes = controllerIds.map((userId) => ({
    audience: { kind: 'controller', userId } as const,
    event: {
      ...base,
      tokens: tokens.map((t) => (t.controllerIds.includes(userId) ? t.privileged : t.others)),
    },
  }));
  return [
    { audience: { kind: 'masters' }, event: { ...base, tokens: tokens.map((t) => t.privileged) } },
    ...mixes,
    {
      audience: { kind: 'rest', controllerIds },
      event: { ...base, tokens: tokens.map((t) => t.others) },
    },
  ];
}

// Everyone with the grid open: a private grid in preparation reaches no player.
function gridRoomOf(event: Readonly<{ campaignId: string; sceneId: string }>): string {
  return sceneRoom(event.campaignId, event.sceneId);
}
