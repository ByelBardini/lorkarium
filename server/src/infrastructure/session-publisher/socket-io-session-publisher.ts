import type {
  SessionCampaignDeletedDto,
  SessionCampaignUpdatedDto,
  SessionMemberActivityDto,
  SessionMemberJoinedDto,
  SessionMemberLeftDto,
  SessionMemberUpdatedDto,
  TableServerEvents,
} from '@lorkarium/contracts';
import type { RemoteSocket } from 'socket.io';
import type {
  MemberRoleMove,
  SessionPublisherPort,
} from '../../modules/sessions/session-publisher.port';
import type { RealtimeServer, RealtimeSocketData } from '../../realtime/realtime-server';
import {
  campaignRoom,
  campaignUserRoom,
  isRoomOfCampaign,
  sceneIdOfRoom,
  sceneUserRoom,
} from '../../realtime/rooms';
import { withoutWatchedTable } from '../../realtime/watched-scenes';

type TableSocket = RemoteSocket<TableServerEvents, RealtimeSocketData>;

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
      if (socket.data.user.id === move.userId) moveToRole(socket, move);
    }
    this.io.to(campaignRoom(event.campaignId)).emit('session:memberUpdated', event);
  }

  async campaignDeleted(event: SessionCampaignDeletedDto): Promise<void> {
    const room = campaignRoom(event.campaignId);
    this.io.to(room).emit('session:campaignDeleted', event);
    const sockets = await this.io.in(room).fetchSockets();
    for (const socket of sockets) forgetTable(socket, event.campaignId);
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
// control is published; a spectator is out of them, so a control kept from before is inert.
function moveToRole(socket: TableSocket, { campaignId, userId, audience }: MemberRoleMove): void {
  const rooms = ownRoomsAt(socket, campaignId, userId);
  if (audience === 'player') return socket.join(rooms);
  for (const room of rooms) socket.leave(room);
}

function ownRoomsAt(socket: TableSocket, campaignId: string, userId: string): string[] {
  const sceneIds = [...socket.rooms].flatMap((room) => sceneIdOfRoom(room, campaignId) ?? []);
  const grids = sceneIds.map((sceneId) => sceneUserRoom(campaignId, sceneId, userId));
  return [campaignUserRoom(campaignId, userId), ...grids];
}
