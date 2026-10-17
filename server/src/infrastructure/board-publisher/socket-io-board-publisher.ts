import type {
  CombatEndedDto,
  CombatStartedDto,
  CombatTurnChangedDto,
  CombatUpdatedDto,
  ConditionAppliedDto,
  ConditionsAppliedDto,
  ConditionDefinedDto,
  ConditionRemovedDto,
  SceneUpdatedDto,
  TokenDeletedDto,
  TokenLayerChangedDto,
  TokenMovedDto,
  TokensDraggedDto,
  TokensMovedDto,
} from '@lorkarium/contracts';
import type { BoardPublisherPort, TokenChange } from '../../modules/scenes/board-publisher.port';
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

  // The layer is not a secret: the whole table gets the same event.
  tokenLayerChanged(event: TokenLayerChangedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('token:layerChanged', event);
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
