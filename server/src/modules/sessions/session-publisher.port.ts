import type {
  SessionCampaignDeletedDto,
  SessionCampaignUpdatedDto,
  SessionMemberActivityDto,
  SessionMemberJoinedDto,
  SessionMemberLeftDto,
  SessionMemberUpdatedDto,
} from '@lorkarium/contracts';

/** Sends a confirmed presence change to everyone in the table's room. */
export interface SessionPublisherPort {
  memberJoined(event: SessionMemberJoinedDto): void;
  memberLeft(event: SessionMemberLeftDto): void;
  memberActivity(event: SessionMemberActivityDto): void;
  memberUpdated(event: SessionMemberUpdatedDto): void;
  campaignUpdated(event: SessionCampaignUpdatedDto): void;
  /** Sends the event, then takes every socket out of the table's rooms (the table, its audiences
   *  and its grids) and forgets the table on each connection, so its slot is free again. */
  campaignDeleted(event: SessionCampaignDeletedDto): Promise<void>;
}
