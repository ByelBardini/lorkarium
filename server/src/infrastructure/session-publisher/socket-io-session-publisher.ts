import type {
  SessionMemberActivityDto,
  SessionMemberJoinedDto,
  SessionMemberLeftDto,
} from '@lorkarium/contracts';
import type { SessionPublisherPort } from '../../modules/sessions/session-publisher.port';
import type { RealtimeServer } from '../../realtime/realtime-server';
import { campaignRoom } from '../../realtime/rooms';

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
}
