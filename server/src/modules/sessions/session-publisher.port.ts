import type { SessionMemberJoinedDto, SessionMemberLeftDto } from '@lorkarium/contracts';

/** Sends a confirmed presence change to everyone in the table's room. */
export interface SessionPublisherPort {
  memberJoined(event: SessionMemberJoinedDto): void;
  memberLeft(event: SessionMemberLeftDto): void;
}
