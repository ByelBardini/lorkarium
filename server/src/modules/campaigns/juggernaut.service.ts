import type { CampaignDetailDto, EndJuggernautResponseDto } from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { UsersDao } from '../auth/users.dao';
import type { CachedMemberships } from './cached-memberships';
import type { CampaignRole } from './campaign-access.bo';
import type { CampaignMembersDao, RevokedAdminSeat } from './campaign-members.dao';
import type { CampaignsDao } from './campaigns.dao';
import { CampaignNotFoundError, ForbiddenActionError } from './campaigns.error';
import { toJuggernautBo } from './campaigns.mapper';
import type { CampaignsService } from './campaigns.service';
import type { JuggernautBo } from './juggernaut.bo';
import type { MemberRemovedPort } from './member-removed.port';
import type { MemberRoleChangedPort } from './member-role-changed.port';

/** What turning the mode on writes with, bound to the open `tx`. */
export type JuggernautStartDaos = Readonly<{
  members: Pick<CampaignMembersDao, 'startJuggernaut'>;
  users: Pick<UsersDao, 'roleForShare'>;
}>;

export type JuggernautTransactionRunner = <T>(
  work: (daos: JuggernautStartDaos) => Promise<T>,
) => Promise<T>;

export type JuggernautServiceDeps = Readonly<{
  campaigns: Pick<CampaignsDao, 'findById'>;
  members: Pick<CampaignMembersDao, 'findMembership' | 'endJuggernaut'>;
  transaction: JuggernautTransactionRunner;
  /** The remembered membership is dropped, so the next board command reads the new seat. */
  memberships: Pick<CachedMemberships, 'forget'>;
  changed: MemberRoleChangedPort;
  removed: MemberRemovedPort;
  /** The detail read back after turning it on, as the admin now reads it. */
  detail: Pick<CampaignsService, 'detail'>;
  clock: ClockPort;
}>;

/** An admin turns juggernaut mode on and off at a table (the route checks the admin role): save,
 *  forget the remembered membership, then tell the live table — in this order.
 *
 *  Example: `await juggernaut.start(userOf(request).id, campaignId)` */
export class JuggernautService {
  constructor(private readonly deps: JuggernautServiceDeps) {}

  /** On: master with owner powers. A member is heard with the new role; someone who was not a
   *  member is told to nobody (an offline juggernaut leaves no trace; they show when they open
   *  the table).
   *
   *  Example: `(await juggernaut.start(rootId, campaignId)).juggernaut // true` */
  async start(userId: string, campaignId: string): Promise<CampaignDetailDto> {
    const decision = (await this.boOf(userId, campaignId)).start();
    if (decision.change === 'started') {
      await this.saveStart(userId, campaignId);
      this.deps.memberships.forget(campaignId, userId);
      const from = decision.roleBefore;
      if (from)
        await this.deps.changed.memberRoleChanged({ campaignId, userId, role: 'master', from });
    }
    return this.deps.detail.detail(userId, campaignId);
  }

  /** Off: back to the role before (the table hears it), or out of the table when there was none
   *  (their connections leave it). Answers the role now, `null` = no longer a member.
   *
   *  Example: `await juggernaut.end(rootId, campaignId) // { myRole: null }` */
  async end(userId: string, campaignId: string): Promise<EndJuggernautResponseDto> {
    const decision = (await this.boOf(userId, campaignId)).end();
    if (decision.change === 'unchanged') return { myRole: decision.role };
    await this.deps.members.endJuggernaut(campaignId, userId);
    this.deps.memberships.forget(campaignId, userId);
    await this.announceEnd(campaignId, userId, decision.restore);
    return { myRole: decision.restore };
  }

  /** Tells each table about a seat the backoffice already revoked. One table failing does not stop
   *  the others; the first failure is rethrown once all were told.
   *
   *  Example: `await juggernaut.announceRevoked(rootId, [{ campaignId, restored: 'player' }])` */
  async announceRevoked(userId: string, seats: readonly RevokedAdminSeat[]): Promise<void> {
    for (const { campaignId } of seats) this.deps.memberships.forget(campaignId, userId);
    const told = await Promise.allSettled(
      seats.map(({ campaignId, restored }) => this.announceEnd(campaignId, userId, restored)),
    );
    const failed = told.find((outcome) => outcome.status === 'rejected');
    if (failed) throw failed.reason;
  }

  // The route guard read the role earlier: the shared lock settles it against a concurrent demotion,
  // which then either refuses this start or, committing later, finds this seat to revoke.
  private async saveStart(userId: string, campaignId: string): Promise<void> {
    const at = this.deps.clock.now();
    await this.deps.transaction(async ({ members, users }) => {
      if ((await users.roleForShare(userId)) !== 'admin')
        throw new ForbiddenActionError(campaignId, userId, 'start juggernaut mode', 'admin role');
      await members.startJuggernaut(campaignId, userId, at);
    });
  }

  private async boOf(userId: string, campaignId: string): Promise<JuggernautBo> {
    const campaign = await this.deps.campaigns.findById(campaignId);
    if (!campaign) throw new CampaignNotFoundError({ campaignId, userId });
    const membership = await this.deps.members.findMembership(campaignId, userId);
    return toJuggernautBo(campaign, userId, membership);
  }

  private async announceEnd(
    campaignId: string,
    userId: string,
    restore: CampaignRole | null,
  ): Promise<void> {
    if (restore === null) return this.deps.removed.memberRemoved({ campaignId, userId });
    const change = { campaignId, userId, role: restore, from: 'master' as const };
    return this.deps.changed.memberRoleChanged(change);
  }
}
