import type {
  SessionCampaignDeletedDto,
  SessionCampaignUpdatedDto,
  SessionMemberActivityDto,
  SessionMemberJoinedDto,
  SessionMemberLeftDto,
  SessionMemberUpdatedDto,
  SessionRemovedFromTableDto,
} from '@lorkarium/contracts';
import type { TableAudience } from '../../realtime/rooms';

/** Whose open connections at a table move rooms, to the rooms of which role, and which grids
 *  they may no longer see (a demoted master's private grids: their tabs close). */
export type MemberRoleMove = Readonly<{
  campaignId: string;
  userId: string;
  audience: TableAudience;
  closedSceneIds: readonly string[];
}>;

/** A member taken out of a table: what their own connections hear, and the `memberLeft` the
 *  table hears after (`null` when they were not at it, so it never listed them). */
export type MemberRemovedEvents = Readonly<{
  userId: string;
  removed: SessionRemovedFromTableDto;
  left: SessionMemberLeftDto | null;
}>;

/** Sends a confirmed presence change to everyone in the table's room. */
export interface SessionPublisherPort {
  memberJoined(event: SessionMemberJoinedDto): void;
  memberLeft(event: SessionMemberLeftDto): void;
  memberActivity(event: SessionMemberActivityDto): void;
  memberUpdated(event: SessionMemberUpdatedDto): void;
  campaignUpdated(event: SessionCampaignUpdatedDto): void;
  /** Moves the member's open connections at the table into the rooms of `move.audience` — their
   *  own and, for a master, the masters' (the table's and each open grid's) — and out of the
   *  others, closes their tabs of `move.closedSceneIds`, then sends `event` to the table's room. */
  memberRoleChanged(event: SessionMemberUpdatedDto, move: MemberRoleMove): Promise<void>;
  /** Sends the event, then takes every socket out of the table's rooms (the table, its audiences
   *  and its grids) and forgets the table on each connection, so its slot is free again. */
  campaignDeleted(event: SessionCampaignDeletedDto): Promise<void>;
  /** Sends `removed` to the member's connections at the table and takes each out of its rooms
   *  (as `campaignDeleted` does), then sends `left` to the table's room. */
  memberRemoved(events: MemberRemovedEvents): Promise<void>;
}
