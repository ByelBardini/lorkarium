import type { ChatSentDto } from '@lorkarium/contracts';
import type { ChatAudience } from '../../modules/chat/chat-message.bo';
import type { ChatPublisherPort } from '../../modules/chat/chat-publisher.port';
import type { RealtimeServer } from '../../realtime/realtime-server';
import { campaignChatRoom, campaignRoom } from '../../realtime/rooms';

/** `chat:sent` over the table's rooms: the Table to the table's room; a whisper, direct or group
 *  message to the chat room of each of its people (every tab of each, the sender's included). A
 *  socket in several of those rooms still gets the event once.
 *
 *  Example: `new SocketIoChatPublisher(realtime.io).sent(event, { kind: 'table' })` */
export class SocketIoChatPublisher implements ChatPublisherPort {
  constructor(private readonly io: RealtimeServer) {}

  sent(event: ChatSentDto, audience: ChatAudience): void {
    this.io.to(roomsOf(event.campaignId, audience)).emit('chat:sent', event);
  }
}

function roomsOf(campaignId: string, audience: ChatAudience): string[] {
  if (audience.kind === 'table') return [campaignRoom(campaignId)];
  return audience.userIds.map((userId) => campaignChatRoom(campaignId, userId));
}
