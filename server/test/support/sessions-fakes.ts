import type {
  SessionCampaignDeletedDto,
  SessionCampaignUpdatedDto,
  SessionMemberActivityDto,
  SessionMemberJoinedDto,
  SessionMemberLeftDto,
  SessionMemberUpdatedDto,
} from '@lorkarium/contracts';
import type { CampaignMemberRow } from '../../src/modules/campaigns/campaign-members.dao';
import { CampaignNotFoundError } from '../../src/modules/campaigns/campaigns.error';
import type { CampaignsService } from '../../src/modules/campaigns/campaigns.service';
import type { PresenceRegistryPort } from '../../src/modules/sessions/presence-registry.port';
import type { SchedulerPort } from '../../src/modules/sessions/scheduler.port';
import type {
  MemberRoleMove,
  SessionPublisherPort,
} from '../../src/modules/sessions/session-publisher.port';
import type { PresenceRoster } from '../../src/modules/sessions/table-presence.bo';

/** One ordered log shared by the registry and the publisher fakes, to prove save → publish. */
export class SessionsJournal {
  readonly entries: string[] = [];
}

/** In-memory rosters that write `save:<campaignId>` to the journal. */
export class PresenceRegistryFake implements PresenceRegistryPort {
  readonly rosters = new Map<string, PresenceRoster>();

  constructor(private readonly journal: SessionsJournal = new SessionsJournal()) {}

  rosterOf(campaignId: string): PresenceRoster | undefined {
    return this.rosters.get(campaignId);
  }

  save(campaignId: string, roster: PresenceRoster): void {
    this.journal.entries.push(`save:${campaignId}`);
    this.rosters.set(campaignId, roster);
  }
}

type ScheduledTask = { delayMs: number; task: () => void };

/** Keeps every pending task by key; `fire(key)` runs one as if its delay had passed. */
export class SchedulerFake implements SchedulerPort {
  readonly scheduled: Record<string, ScheduledTask> = {};
  readonly cancelled: string[] = [];

  schedule(key: string, delayMs: number, task: () => void): void {
    this.scheduled[key] = { delayMs, task };
  }

  cancel(key: string): void {
    this.cancelled.push(key);
    delete this.scheduled[key];
  }

  fire(key: string): void {
    const pending = this.scheduled[key];
    if (!pending)
      throw new Error(
        `no task scheduled under ${key}; pending: ${Object.keys(this.scheduled).join(', ')}`,
      );
    delete this.scheduled[key];
    pending.task();
  }
}

export type PublishedSessionEvent =
  | Readonly<{ name: 'memberJoined'; event: SessionMemberJoinedDto }>
  | Readonly<{ name: 'memberLeft'; event: SessionMemberLeftDto }>
  | Readonly<{ name: 'memberActivity'; event: SessionMemberActivityDto }>
  | Readonly<{ name: 'memberUpdated'; event: SessionMemberUpdatedDto }>
  | Readonly<{ name: 'campaignUpdated'; event: SessionCampaignUpdatedDto }>
  | Readonly<{ name: 'campaignDeleted'; event: SessionCampaignDeletedDto }>
  | Readonly<{ name: 'memberRoleChanged'; event: SessionMemberUpdatedDto; move: MemberRoleMove }>;

/** Keeps every published event and writes `publish:<name>` to the journal (a role change as
 *  `publish:memberRoleChanged:<campaignId>`, with the rooms move it asked for). */
export class SessionPublisherFake implements SessionPublisherPort {
  readonly published: PublishedSessionEvent[] = [];

  constructor(private readonly journal: SessionsJournal = new SessionsJournal()) {}

  memberJoined(event: SessionMemberJoinedDto): void {
    this.journal.entries.push('publish:memberJoined');
    this.published.push({ name: 'memberJoined', event });
  }

  memberLeft(event: SessionMemberLeftDto): void {
    this.journal.entries.push('publish:memberLeft');
    this.published.push({ name: 'memberLeft', event });
  }

  memberActivity(event: SessionMemberActivityDto): void {
    this.journal.entries.push('publish:memberActivity');
    this.published.push({ name: 'memberActivity', event });
  }

  memberUpdated(event: SessionMemberUpdatedDto): void {
    this.journal.entries.push(`publish:memberUpdated:${event.campaignId}`);
    this.published.push({ name: 'memberUpdated', event });
  }

  campaignUpdated(event: SessionCampaignUpdatedDto): void {
    this.journal.entries.push(`publish:campaignUpdated:${event.campaignId}`);
    this.published.push({ name: 'campaignUpdated', event });
  }

  async campaignDeleted(event: SessionCampaignDeletedDto): Promise<void> {
    this.journal.entries.push(`publish:campaignDeleted:${event.campaignId}`);
    this.published.push({ name: 'campaignDeleted', event });
  }

  async memberRoleChanged(event: SessionMemberUpdatedDto, move: MemberRoleMove): Promise<void> {
    this.journal.entries.push(`publish:memberRoleChanged:${event.campaignId}`);
    this.published.push({ name: 'memberRoleChanged', event, move });
  }
}

/** Members by table; whoever is not in a table's list is refused like `CampaignsService` does.
 *  A spec may swap a table's members (`tables[id] = [...]`) to play a profile saved meanwhile. */
export class CampaignRosterFake implements Pick<CampaignsService, 'rosterOf' | 'campaignIdsOf'> {
  constructor(readonly tables: Record<string, readonly CampaignMemberRow[]>) {}

  async campaignIdsOf(userId: string): Promise<string[]> {
    const ids = Object.keys(this.tables);
    return ids.filter((id) => this.tables[id]?.some((member) => member.userId === userId));
  }

  async rosterOf(userId: string, campaignId: string): Promise<CampaignMemberRow[]> {
    const members = this.tables[campaignId] ?? [];
    if (!members.some((member) => member.userId === userId)) {
      throw new CampaignNotFoundError({ campaignId, userId });
    }
    return [...members];
  }
}
