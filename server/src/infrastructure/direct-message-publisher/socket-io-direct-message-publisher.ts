import type { DmSentDto, DmTypingFromDto } from '@lorkarium/contracts';
import type { DirectMessagePublisherPort } from '../../modules/direct-messages/direct-message-publisher.port';
import type { RealtimeServer } from '../../realtime/realtime-server';
import { userRoom } from '../../realtime/rooms';

/** `dm:sent` to both accounts' `user:<id>` rooms (every tab, the sender's other tabs too) and
 *  `dm:typingFrom` to the recipient's only.
 *
 *  Example: `new SocketIoDirectMessagePublisher(realtime.io).sent(event)` */
export class SocketIoDirectMessagePublisher implements DirectMessagePublisherPort {
  constructor(private readonly io: RealtimeServer) {}

  sent(event: DmSentDto): void {
    this.io.to([userRoom(event.fromUserId), userRoom(event.toUserId)]).emit('dm:sent', event);
  }

  typing(recipientId: string, event: DmTypingFromDto): void {
    this.io.to(userRoom(recipientId)).emit('dm:typingFrom', event);
  }
}
