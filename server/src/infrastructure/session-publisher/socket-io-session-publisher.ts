import type {
  SessionCampaignDeletedDto,
  SessionCampaignUpdatedDto,
  SessionMemberActivityDto,
  SessionMemberJoinedDto,
  SessionMemberLeftDto,
  SessionMemberUpdatedDto,
} from '@lorkarium/contracts';
import type {
  MemberRemovedEvents,
  MemberRoleMove,
  SessionPublisherPort,
} from '../../modules/sessions/session-publisher.port';
import type { RealtimeServer } from '../../realtime/realtime-server';
import {
  campaignMastersRoom,
  campaignRoom,
  campaignUserRoom,
  isRoomOfCampaign,
  sceneAudienceRooms,
  sceneIdOfRoom,
  type TableAudience,
} from '../../realtime/rooms';
import { closeTab, hasTab, type TableSocket } from '../../realtime/scene-tabs';
import { withoutWatchedTable } from '../../realtime/watched-scenes';

/** Emits each presence change to the room of its table, and only there (spec §2.6).
 *
 *  Example: `new SocketIoSessionPublisher(realtime.io).memberLeft(event)` */
export class SocketIoSessionPublisher implements SessionPublisherPort {
  constructor(private readonly io: RealtimeServer) {}

  memberJoined(event: SessionMemberJoinedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('session:memberJoined', event);
  }

  memberLeft(event: SessionMemberLeftDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('session:memberLeft', event);
  }

  memberActivity(event: SessionMemberActivityDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('session:memberActivity', event);
  }

  memberUpdated(event: SessionMemberUpdatedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('session:memberUpdated', event);
  }

  campaignUpdated(event: SessionCampaignUpdatedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('session:campaignUpdated', event);
  }

  // The rooms move first: the member hears the event already in the rooms of the new role, so
  // the board read after it (`board:sync`) and what follows match that role.
  async memberRoleChanged(event: SessionMemberUpdatedDto, move: MemberRoleMove): Promise<void> {
    const sockets = await this.io.in(campaignRoom(move.campaignId)).fetchSockets();
    for (const socket of sockets) {
      if (socket.data.user.id === move.userId) moveToRole(socket, move, event.at);
    }
    this.io.to(campaignRoom(event.campaignId)).emit('session:memberUpdated', event);
  }

  async campaignDeleted(event: SessionCampaignDeletedDto): Promise<void> {
    const room = campaignRoom(event.campaignId);
    this.io.to(room).emit('session:campaignDeleted', event);
    const sockets = await this.io.in(room).fetchSockets();
    for (const socket of sockets) forgetTable(socket, event.campaignId);
  }

  // Their connections first: once out of the rooms, the memberLeft that follows is not theirs.
  async memberRemoved({ userId, removed, left }: MemberRemovedEvents): Promise<void> {
    const sockets = await this.io.in(campaignRoom(removed.campaignId)).fetchSockets();
    for (const socket of sockets) {
      if (socket.data.user.id !== userId) continue;
      socket.emit('session:removedFromTable', removed);
      forgetTable(socket, removed.campaignId);
    }
    if (left) this.io.to(campaignRoom(left.campaignId)).emit('session:memberLeft', left);
  }
}

// What a `session:leave` would undo, done by the server: the table no longer exists.
function forgetTable(socket: TableSocket, campaignId: string): void {
  for (const room of [...socket.rooms]) {
    if (isRoomOfCampaign(room, campaignId)) socket.leave(room);
  }
  const campaignIds = new Set(socket.data.campaignIds);
  campaignIds.delete(campaignId);
  socket.data.campaignIds = campaignIds;
  socket.data.watchedSceneIds = withoutWatchedTable(socket.data.watchedSceneIds, campaignId);
}

// A player is in their own rooms (the table's and each open grid's), where the whole token they
// control is published; a master also in the masters' ones; a spectator is out of all of them,
// so a control kept from before is inert. A demoted master's tabs of private grids close.
function moveToRole(socket: TableSocket, move: MemberRoleMove, at: string): void {
  const { campaignId, userId, audience } = move;
  const sceneIds = [...socket.rooms].flatMap((room) => sceneIdOfRoom(room, campaignId) ?? []);
  const kept = new Set(roleRoomsOf(campaignId, userId, audience, sceneIds));
  for (const room of roleRoomsOf(campaignId, userId, 'master', sceneIds)) {
    if (!kept.has(room) && socket.rooms.has(room)) void socket.leave(room);
  }
  const missing = [...kept].filter((room) => !socket.rooms.has(room));
  if (missing.length > 0) void socket.join(missing);
  for (const sceneId of move.closedSceneIds) {
    if (hasTab(socket, campaignId, sceneId))
      closeTab(socket, { campaignId, sceneId, reason: 'private', at });
  }
}

// The rooms of the table a role has, beside the table's own: for each open grid its rooms.
function roleRoomsOf(
  campaignId: string,
  userId: string,
  audience: TableAudience,
  sceneIds: readonly string[],
): string[] {
  const grids = sceneIds.flatMap((id) => sceneAudienceRooms(campaignId, id, userId, audience));
  if (audience === 'spectator') return grids;
  const own = [campaignUserRoom(campaignId, userId)];
  if (audience === 'master') own.push(campaignMastersRoom(campaignId));
  return [...own, ...grids];
}
