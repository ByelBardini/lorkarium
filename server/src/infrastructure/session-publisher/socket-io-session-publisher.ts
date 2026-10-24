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
import type { SessionPublisherPort } from '../../modules/sessions/session-publisher.port';
import type { RealtimeServer, RealtimeSocketData } from '../../realtime/realtime-server';
import { campaignRoom, isRoomOfCampaign } from '../../realtime/rooms';
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
