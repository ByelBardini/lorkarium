import { MAX_OPEN_TABLES, type SessionStateDto } from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMemberRow } from '../campaigns/campaign-members.dao';
import type { CampaignsService } from '../campaigns/campaigns.service';
import { ConnectionTablesBo, type ConnectionTablesOutcome } from './connection-tables.bo';
import type { PresenceRegistryPort } from './presence-registry.port';
import type { SchedulerPort } from './scheduler.port';
import type { SessionPublisherPort } from './session-publisher.port';
import { toMemberJoinedDto, toMemberLeftDto, toSessionStateDto } from './sessions.mapper';
import {
  EMPTY_ROSTER,
  TablePresenceBo,
  type DisconnectReason,
  type PresenceOutcome,
} from './table-presence.bo';

// Long enough to cover an F5 or a short network blip, so others do not see "left / joined".
export const PRESENCE_GRACE_MS = 5000;

export type TableSessionServiceDeps = Readonly<{
  campaigns: Pick<CampaignsService, 'rosterOf'>;
  registry: PresenceRegistryPort;
  scheduler: SchedulerPort;
  publisher: SessionPublisherPort;
  clock: ClockPort;
}>;

/** Entering, leaving and dropping out of a table's live session; saves the roster before
 *  publishing, and publishes only what others can see change.
 *
 *  Example: `const state = await sessions.join(user.id, campaignId, socket.id)` */
export class TableSessionService {
  constructor(private readonly deps: TableSessionServiceDeps) {}

  async join(userId: string, campaignId: string, socketId: string): Promise<SessionStateDto> {
    const members = await this.deps.campaigns.rosterOf(userId, campaignId);
    const outcome = this.presenceAt(campaignId).connect(userId, socketId);
    this.deps.registry.save(campaignId, outcome.roster);
    if (outcome.change === 'returned-in-grace') {
      this.deps.scheduler.cancel(graceKey(campaignId, userId));
    }
    if (outcome.change === 'came-online') {
      this.announceArrival(campaignId, userId, members, outcome);
    }
    return toSessionStateDto(campaignId, members, outcome.roster, this.deps.clock.now());
  }

  leave(userId: string, campaignId: string, socketId: string): void {
    this.disconnect(userId, campaignId, socketId, 'left');
  }

  drop(userId: string, campaignId: string, socketId: string): void {
    const outcome = this.disconnect(userId, campaignId, socketId, 'dropped');
    if (outcome.change !== 'grace-started') return;
    const expireUser = (): void => this.expire(campaignId, userId);
    this.deps.scheduler.schedule(graceKey(campaignId, userId), PRESENCE_GRACE_MS, expireUser);
  }

  expire(campaignId: string, userId: string): void {
    this.apply(campaignId, userId, this.presenceAt(campaignId).expireGrace(userId));
  }

  /** Reserves a slot for `campaignId` among the connection's tables; throws `TOO_MANY_TABLES`.
   *
   *  Example: `socket.data.campaignIds = sessions.admitTable(socket.data.campaignIds, id).tables` */
  admitTable(open: ReadonlySet<string>, campaignId: string): ConnectionTablesOutcome {
    return new ConnectionTablesBo(open, MAX_OPEN_TABLES).admit(campaignId);
  }

  releaseTable(open: ReadonlySet<string>, campaignId: string): ConnectionTablesOutcome {
    return new ConnectionTablesBo(open, MAX_OPEN_TABLES).release(campaignId);
  }

  private announceArrival(
    campaignId: string,
    userId: string,
    members: readonly CampaignMemberRow[],
    outcome: PresenceOutcome,
  ): void {
    const member = members.find((candidate) => candidate.userId === userId);
    if (!member) throw new Error(`user ${userId} joined ${campaignId} but is not in its roster`);
    const at = this.deps.clock.now();
    this.deps.publisher.memberJoined(
      toMemberJoinedDto(campaignId, member, outcome.roster.version, at),
    );
  }

  private disconnect(
    userId: string,
    campaignId: string,
    socketId: string,
    reason: DisconnectReason,
  ): PresenceOutcome {
    const outcome = this.presenceAt(campaignId).disconnect(userId, socketId, reason);
    return this.apply(campaignId, userId, outcome);
  }

  private apply(campaignId: string, userId: string, outcome: PresenceOutcome): PresenceOutcome {
    if (outcome.change === 'not-connected' || outcome.change === 'already-back') return outcome;
    this.deps.registry.save(campaignId, outcome.roster);
    if (outcome.change !== 'went-offline') return outcome;
    const event = toMemberLeftDto(
      campaignId,
      userId,
      outcome.roster.version,
      this.deps.clock.now(),
    );
    this.deps.publisher.memberLeft(event);
    return outcome;
  }

  private presenceAt(campaignId: string): TablePresenceBo {
    return new TablePresenceBo(this.deps.registry.rosterOf(campaignId) ?? EMPTY_ROSTER);
  }
}

function graceKey(campaignId: string, userId: string): string {
  return `${campaignId}:${userId}`;
}
