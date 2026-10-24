import type {
  SessionCampaignDeletedDto,
  SessionCampaignUpdatedDto,
  SessionMemberActivityDto,
  SessionMemberJoinedDto,
  SessionMemberLeftDto,
  SessionMemberUpdatedDto,
} from '@lorkarium/contracts';

/** Whose open connections at a table move rooms, and to the rooms of which role. */
export type MemberRoleMove = Readonly<{
  campaignId: string;
  userId: string;
  audience: 'player' | 'spectator';
}>;

/** Sends a confirmed presence change to everyone in the table's room. */
export interface SessionPublisherPort {
  memberJoined(event: SessionMemberJoinedDto): void;
  memberLeft(event: SessionMemberLeftDto): void;
  memberActivity(event: SessionMemberActivityDto): void;
  memberUpdated(event: SessionMemberUpdatedDto): void;
  campaignUpdated(event: SessionCampaignUpdatedDto): void;
  /** Moves the member's open connections at the table into (player) or out of (spectator) their
   *  own rooms — the table's and each open grid's —, then sends `event` to the table's room. */
  memberRoleChanged(event: SessionMemberUpdatedDto, move: MemberRoleMove): Promise<void>;
  /** Sends the event, then takes every socket out of the table's rooms (the table, its audiences
   *  and its grids) and forgets the table on each connection, so its slot is free again. */
  campaignDeleted(event: SessionCampaignDeletedDto): Promise<void>;
}
