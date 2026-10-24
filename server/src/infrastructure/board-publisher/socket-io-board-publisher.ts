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
  SceneUpdatedDto,
  TokenDeletedDto,
  TokenLayerChangedDto,
  TokenMovedDto,
  TokensDeletedDto,
  TokensDraggedDto,
  TokensFacedDto,
  TokensMovedDto,
  TokensRestyledDto,
} from '@lorkarium/contracts';
import type {
  BoardPublisherPort,
  GridEvent,
  TokenChange,
  TokensCreation,
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

  tokenChanged(change: TokenChange): void {
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

  tokenMoved(event: GridEvent<TokenMovedDto>): void {
    this.io.to(gridRoomOf(event)).emit('token:moved', event);
  }

  tokensMoved(event: GridEvent<TokensMovedDto>): void {
    this.io.to(gridRoomOf(event)).emit('token:movedMany', event);
  }

  // Every socket is in a room named by its own id: leaving it out skips the dragger's echo.
  tokensDragged(event: GridEvent<TokensDraggedDto>, exceptConnectionId: string): void {
    this.io.to(gridRoomOf(event)).except(exceptConnectionId).emit('token:draggedMany', event);
  }

  tokenDeleted(event: GridEvent<TokenDeletedDto>): void {
    this.io.to(gridRoomOf(event)).emit('token:deleted', event);
  }

  // Each controller gets their own mix (whole for theirs, redacted for the rest); a master who
  // also controls a token only hears the masters' cut, so nobody hears the paste twice.
  tokensCreated(creation: TokensCreation): void {
    const { campaignId, sceneId, tokens, combat } = creation;
    const base = { campaignId, sceneId, version: creation.version, at: creation.at, combat };
    const masters = sceneMastersRoom(campaignId, sceneId);
    const whole = tokens.map((token) => token.privileged);
    this.io.to(masters).emit('token:createdMany', { ...base, tokens: whole });
    const controllerIds = [...new Set(tokens.flatMap((token) => token.controllerIds))];
    const userRoom = (userId: string): string => sceneUserRoom(campaignId, sceneId, userId);
    for (const userId of controllerIds) {
      const mix = tokens.map((t) => (t.controllerIds.includes(userId) ? t.privileged : t.others));
      this.io
        .to(userRoom(userId))
        .except(masters)
        .emit('token:createdMany', { ...base, tokens: mix });
    }
    const privileged = [masters, ...controllerIds.map(userRoom)];
    const redacted = tokens.map((token) => token.others);
    this.io
      .to(sceneRoom(campaignId, sceneId))
      .except(privileged)
      .emit('token:createdMany', { ...base, tokens: redacted });
  }

  tokensDeleted(event: GridEvent<TokensDeletedDto>): void {
    this.io.to(gridRoomOf(event)).emit('token:deletedMany', event);
  }

  // The layer is not a secret: everyone with the grid open gets the same event.
  tokenLayerChanged(event: GridEvent<TokenLayerChangedDto>): void {
    this.io.to(gridRoomOf(event)).emit('token:layerChanged', event);
  }

  tokensFaced(event: GridEvent<TokensFacedDto>): void {
    this.io.to(gridRoomOf(event)).emit('token:facedMany', event);
  }

  tokensRestyled(event: GridEvent<TokensRestyledDto>): void {
    this.io.to(gridRoomOf(event)).emit('token:restyledMany', event);
  }

  tokensResized(event: GridEvent<TokensResizedDto>): void {
    this.io.to(gridRoomOf(event)).emit('token:resizedMany', event);
  }

  mainTokenChanged(event: GridEvent<MainTokenChangedDto>): void {
    this.io.to(gridRoomOf(event)).emit('token:mainChanged', event);
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

  conditionApplied(event: GridEvent<ConditionAppliedDto>): void {
    this.io.to(gridRoomOf(event)).emit('condition:applied', event);
  }

  conditionsApplied(event: GridEvent<ConditionsAppliedDto>): void {
    this.io.to(gridRoomOf(event)).emit('condition:appliedMany', event);
  }

  conditionRemoved(event: GridEvent<ConditionRemovedDto>): void {
    this.io.to(gridRoomOf(event)).emit('condition:removed', event);
  }

  conditionsChanged(event: GridEvent<ConditionsChangedDto>): void {
    this.io.to(gridRoomOf(event)).emit('condition:changedMany', event);
  }

  combatStarted(event: GridEvent<CombatStartedDto>): void {
    this.io.to(gridRoomOf(event)).emit('combat:started', event);
  }

  combatUpdated(event: GridEvent<CombatUpdatedDto>): void {
    this.io.to(gridRoomOf(event)).emit('combat:updated', event);
  }

  combatTurnChanged(event: GridEvent<CombatTurnChangedDto>): void {
    this.io.to(gridRoomOf(event)).emit('combat:turnChanged', event);
  }

  combatEnded(event: GridEvent<CombatEndedDto>): void {
    this.io.to(gridRoomOf(event)).emit('combat:ended', event);
  }
}

// Everyone with the grid open: a private grid in preparation reaches no player.
function gridRoomOf(event: Readonly<{ campaignId: string; sceneId: string }>): string {
  return sceneRoom(event.campaignId, event.sceneId);
}
