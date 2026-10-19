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
  TokenChange,
  TokensCreation,
} from '../../modules/scenes/board-publisher.port';
import type { RealtimeServer } from '../../realtime/realtime-server';
import { campaignMastersRoom, campaignRoom, campaignUserRoom } from '../../realtime/rooms';

/** Emits each confirmed board change to the rooms of its table, and only there (spec §2.6).
 *  A token goes whole to the masters and its controllers, and redacted to the rest of the table.
 *
 *  Example: `new SocketIoBoardPublisher(realtime.io).tokenChanged(change)` */
export class SocketIoBoardPublisher implements BoardPublisherPort {
  constructor(private readonly io: RealtimeServer) {}

  sceneUpdated(event: SceneUpdatedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('scene:updated', event);
  }

  tokenChanged(change: TokenChange): void {
    const privilegedRooms = [
      campaignMastersRoom(change.campaignId),
      ...change.controllerIds.map((userId) => campaignUserRoom(change.campaignId, userId)),
    ];
    this.io.to(privilegedRooms).emit(change.name, change.privileged);
    this.io
      .to(campaignRoom(change.campaignId))
      .except(privilegedRooms)
      .emit(change.name, change.others);
  }

  tokenMoved(event: TokenMovedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('token:moved', event);
  }

  tokensMoved(event: TokensMovedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('token:movedMany', event);
  }

  // Every socket is in a room named by its own id: leaving it out skips the dragger's echo.
  tokensDragged(event: TokensDraggedDto, exceptConnectionId: string): void {
    this.io
      .to(campaignRoom(event.campaignId))
      .except(exceptConnectionId)
      .emit('token:draggedMany', event);
  }

  tokenDeleted(event: TokenDeletedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('token:deleted', event);
  }

  // Each controller gets their own mix (whole for theirs, redacted for the rest); a master who
  // also controls a token only hears the masters' cut, so nobody hears the paste twice.
  tokensCreated(creation: TokensCreation): void {
    const { campaignId, tokens, combat } = creation;
    const base = { campaignId, version: creation.version, at: creation.at, combat };
    const masters = campaignMastersRoom(campaignId);
    const whole = tokens.map((token) => token.privileged);
    this.io.to(masters).emit('token:createdMany', { ...base, tokens: whole });
    const controllerIds = [...new Set(tokens.flatMap((token) => token.controllerIds))];
    for (const userId of controllerIds) {
      const mix = tokens.map((t) => (t.controllerIds.includes(userId) ? t.privileged : t.others));
      const room = campaignUserRoom(campaignId, userId);
      this.io
        .to(room)
        .except(masters)
        .emit('token:createdMany', { ...base, tokens: mix });
    }
    const privileged = [masters, ...controllerIds.map((id) => campaignUserRoom(campaignId, id))];
    const redacted = tokens.map((token) => token.others);
    this.io
      .to(campaignRoom(campaignId))
      .except(privileged)
      .emit('token:createdMany', { ...base, tokens: redacted });
  }

  tokensDeleted(event: TokensDeletedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('token:deletedMany', event);
  }

  // The layer is not a secret: the whole table gets the same event.
  tokenLayerChanged(event: TokenLayerChangedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('token:layerChanged', event);
  }

  tokensFaced(event: TokensFacedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('token:facedMany', event);
  }

  tokensRestyled(event: TokensRestyledDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('token:restyledMany', event);
  }

  tokensResized(event: TokensResizedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('token:resizedMany', event);
  }

  // A drawing is not a secret: the layer only decides who picks it up, not who sees it.
  drawingsCreated(event: DrawingsCreatedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('drawing:createdMany', event);
  }

  drawingsMoved(event: DrawingsMovedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('drawing:movedMany', event);
  }

  drawingsDeleted(event: DrawingsDeletedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('drawing:deletedMany', event);
  }

  // An area of effect is a template everyone at the table reads: nothing to redact.
  effectAreasCreated(event: EffectAreasCreatedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('effectArea:createdMany', event);
  }

  effectAreasReshaped(event: EffectAreasReshapedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('effectArea:reshapedMany', event);
  }

  effectAreasDeleted(event: EffectAreasDeletedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('effectArea:deletedMany', event);
  }

  wallsCreated(event: WallsCreatedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('wall:createdMany', event);
  }

  wallsMoved(event: WallsMovedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('wall:movedMany', event);
  }

  wallsDeleted(event: WallsDeletedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('wall:deletedMany', event);
  }

  wallKindsChanged(event: WallKindsChangedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('wall:kindsChanged', event);
  }

  doorChanged(event: DoorChangedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('wall:doorChanged', event);
  }

  wallSegmentErased(event: WallSegmentErasedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('wall:segmentErased', event);
  }

  wallAreaErased(event: WallAreaErasedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('wall:areaErased', event);
  }

  // Conditions are on the token for everyone to see: nothing to redact (spec §3.7).
  conditionDefined(event: ConditionDefinedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('condition:defined', event);
  }

  conditionApplied(event: ConditionAppliedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('condition:applied', event);
  }

  conditionsApplied(event: ConditionsAppliedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('condition:appliedMany', event);
  }

  conditionRemoved(event: ConditionRemovedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('condition:removed', event);
  }

  combatStarted(event: CombatStartedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('combat:started', event);
  }

  combatUpdated(event: CombatUpdatedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('combat:updated', event);
  }

  combatTurnChanged(event: CombatTurnChangedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('combat:turnChanged', event);
  }

  combatEnded(event: CombatEndedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('combat:ended', event);
  }
}
