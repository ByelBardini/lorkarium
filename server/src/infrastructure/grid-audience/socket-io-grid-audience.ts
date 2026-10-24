import type { GridAudiencePort } from '../../modules/pings/grid-audience.port';
import type { RealtimeServer } from '../../realtime/realtime-server';
import { sceneRoom } from '../../realtime/rooms';

/** Reads the rooms of a connection on this server: a ping is answered on the connection that
 *  sent it, so the socket is always local.
 *
 *  Example: `new SocketIoGridAudience(realtime.io).reaches(socket.id, campaignId, sceneId)` */
export class SocketIoGridAudience implements GridAudiencePort {
  constructor(private readonly io: RealtimeServer) {}

  reaches(connectionId: string, campaignId: string, sceneId: string): boolean {
    const socket = this.io.sockets.sockets.get(connectionId);
    return socket?.rooms.has(sceneRoom(campaignId, sceneId)) ?? false;
  }
}
