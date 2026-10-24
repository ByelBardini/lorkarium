import { MAX_OPEN_TABLES, type CampaignInfoDto, type SessionStateDto } from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMemberRow } from '../campaigns/campaign-members.dao';
import type { CampaignsService } from '../campaigns/campaigns.service';
import { ConnectionTablesBo, type ConnectionTablesOutcome } from './connection-tables.bo';
import type { PresenceRegistryPort } from './presence-registry.port';
import type { SchedulerPort } from './scheduler.port';
import type { SessionPublisherPort } from './session-publisher.port';
import {
  toCampaignDeletedDto,
  toCampaignUpdatedDto,
  toMemberActivityDto,
  toMemberJoinedDto,
  toMemberLeftDto,
  toMemberUpdatedDto,
  toSessionStateDto,
} from './sessions.mapper';
import {
  EMPTY_ROSTER,
  TablePresenceBo,
  type DisconnectReason,
  type PresenceChange,
  type PresenceOutcome,
} from './table-presence.bo';

// Long enough to cover an F5 or a short network blip, so others do not see "left / joined".
export const PRESENCE_GRACE_MS = 5000;

// What leaves the roster as it was: nothing to save, nothing to publish.
const UNCHANGED: ReadonlySet<PresenceChange> = new Set([
  'not-connected',
  'already-back',
  'already-away',
]);

export type TableSessionServiceDeps = Readonly<{
  campaigns: Pick<CampaignsService, 'rosterOf' | 'campaignIdsOf'>;
  registry: PresenceRegistryPort;
  scheduler: SchedulerPort;
  publisher: SessionPublisherPort;
  clock: ClockPort;
}>;

/** Entering, leaving, dropping out of and standing still at a table's live session; saves the
 *  roster before publishing, and publishes only what others can see change.
 *
 *  Example: `const state = await sessions.join(user.id, campaignId, socket.id)` */
export class TableSessionService {
  constructor(private readonly deps: TableSessionServiceDeps) {}

  async join(userId: string, campaignId: string, socketId: string): Promise<SessionStateDto> {
    const members = await this.deps.campaigns.rosterOf(userId, campaignId);
    const outcome = this.presenceAt(campaignId).connect(userId, socketId);
    this.deps.registry.save(campaignId, outcome.roster);
    if (outcome.change === 'returned-in-grace' || outcome.change === 'came-back') {
      this.deps.scheduler.cancel(graceKey(campaignId, userId));
    }
    if (outcome.change === 'came-online') {
      this.announceArrival(campaignId, userId, members, outcome);
    }
    if (outcome.change === 'came-back') this.announceActivity(campaignId, userId, outcome);
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

  /** This tab stood still (`away`) or moved again; the user is away once every tab is still.
   *
   *  Example: `sessions.setActivity(user.id, campaignId, socket.id, true)` */
  setActivity(userId: string, campaignId: string, socketId: string, away: boolean): void {
    const presence = this.presenceAt(campaignId);
    const outcome = away
      ? presence.markAway(userId, socketId, this.deps.clock.now())
      : presence.markActive(userId, socketId);
    this.apply(campaignId, userId, outcome);
  }

  expire(campaignId: string, userId: string): void {
    this.apply(campaignId, userId, this.presenceAt(campaignId).expireGrace(userId));
  }

  /** The person saved their profile: each table of theirs with someone at it hears the member
   *  read again (`session:memberUpdated`) with the version moved; a table nobody is at hears
   *  nothing and keeps no roster. Implements the profiles module's `ProfileChangedPort`.
   *
   *  Example: `await sessions.profileChanged(user.id)` */
  async profileChanged(userId: string): Promise<void> {
    const campaignIds = await this.deps.campaigns.campaignIdsOf(userId);
    const live = campaignIds.filter((id) => this.deps.registry.rosterOf(id) !== undefined);
    await Promise.all(live.map((campaignId) => this.announceProfile(userId, campaignId)));
  }

  /** The master saved the campaign: a table with someone at it hears the campaign read again
   *  (`session:campaignUpdated`) with the version moved; a table nobody is at hears nothing and
   *  keeps no roster. Implements the campaigns module's `CampaignChangedPort`.
   *
   *  Example: `sessions.campaignUpdated(toCampaignInfoDto(detail))` */
  campaignUpdated(campaign: CampaignInfoDto): void {
    const roster = this.deps.registry.rosterOf(campaign.id);
    if (!roster) return;
    const outcome = new TablePresenceBo(roster).campaignChanged();
    this.deps.registry.save(campaign.id, outcome.roster);
    const { version } = outcome.roster;
    this.deps.publisher.campaignUpdated(
      toCampaignUpdatedDto(campaign, version, this.deps.clock.now()),
    );
  }

  /** The campaign was deleted: its roster and pending grace expiries go, then the room hears
   *  `session:campaignDeleted` and every socket is taken out of it.
   *
   *  Example: `await sessions.campaignDeleted(campaignId)` */
  async campaignDeleted(campaignId: string): Promise<void> {
    const roster = this.deps.registry.rosterOf(campaignId);
    for (const userId of roster?.inGrace ?? []) {
      this.deps.scheduler.cancel(graceKey(campaignId, userId));
    }
    if (roster) this.deps.registry.save(campaignId, EMPTY_ROSTER);
    const event = toCampaignDeletedDto(campaignId, this.deps.clock.now());
    await this.deps.publisher.campaignDeleted(event);
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

  // The roster is read again after the await: it may have moved while the members were read.
  private async announceProfile(userId: string, campaignId: string): Promise<void> {
    const members = await this.deps.campaigns.rosterOf(userId, campaignId);
    const member = members.find((candidate) => candidate.userId === userId);
    if (!member) throw new Error(`user ${userId} changed profile but is not in ${campaignId}`);
    const roster = this.deps.registry.rosterOf(campaignId);
    if (!roster) return;
    const outcome = new TablePresenceBo(roster).profileChanged();
    this.deps.registry.save(campaignId, outcome.roster);
    const at = this.deps.clock.now();
    this.deps.publisher.memberUpdated(toMemberUpdatedDto(campaignId, member, outcome.roster, at));
  }

  private disconnect(
    userId: string,
    campaignId: string,
    socketId: string,
    reason: DisconnectReason,
  ): PresenceOutcome {
    const at = this.deps.clock.now();
    const outcome = this.presenceAt(campaignId).disconnect(userId, socketId, reason, at);
    return this.apply(campaignId, userId, outcome);
  }

  private apply(campaignId: string, userId: string, outcome: PresenceOutcome): PresenceOutcome {
    if (UNCHANGED.has(outcome.change)) return outcome;
    this.deps.registry.save(campaignId, outcome.roster);
    if (outcome.change === 'went-away' || outcome.change === 'came-back') {
      this.announceActivity(campaignId, userId, outcome);
    }
    if (outcome.change !== 'went-offline') return outcome;
    const at = this.deps.clock.now();
    this.deps.publisher.memberLeft(toMemberLeftDto(campaignId, userId, outcome.roster.version, at));
    return outcome;
  }

  private announceActivity(campaignId: string, userId: string, outcome: PresenceOutcome): void {
    const awaySince = new TablePresenceBo(outcome.roster).awaySinceOf(userId);
    const { version } = outcome.roster;
    const at = this.deps.clock.now();
    this.deps.publisher.memberActivity(
      toMemberActivityDto(campaignId, userId, awaySince, version, at),
    );
  }

  private presenceAt(campaignId: string): TablePresenceBo {
    return new TablePresenceBo(this.deps.registry.rosterOf(campaignId) ?? EMPTY_ROSTER);
  }
}

function graceKey(campaignId: string, userId: string): string {
  return `${campaignId}:${userId}`;
}
