import type { BoardPingedDto } from '@lorkarium/contracts';
import type { PingPublisherPort } from '../../modules/pings/ping-publisher.port';
import type { RealtimeServer } from '../../realtime/realtime-server';
import { sceneRoom } from '../../realtime/rooms';

/** `board:pinged` to the grid's room. Every socket is in a room named by its own id: leaving it
 *  out skips the echo to the connection that pinged (another tab of the same person still hears).
 *
 *  Example: `new SocketIoPingPublisher(realtime.io).pinged(event, socket.id)` */
export class SocketIoPingPublisher implements PingPublisherPort {
  constructor(private readonly io: RealtimeServer) {}

  pinged(event: BoardPingedDto, exceptConnectionId: string): void {
    const room = sceneRoom(event.campaignId, event.sceneId);
    this.io.to(room).except(exceptConnectionId).emit('board:pinged', event);
  }
}
