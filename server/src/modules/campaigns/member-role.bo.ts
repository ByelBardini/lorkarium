import { assignableRolesOf, type TableSeat } from '@lorkarium/game-core';
import { CampaignAccessBo, type CampaignRole } from './campaign-access.bo';
import {
  JuggernautRoleLockedError,
  MemberNotFoundError,
  OwnerRoleLockedError,
} from './campaigns.error';

/** Someone at (or outside) the table: their seat, `null` when they are not a member. */
export type SeatedMember = Readonly<{ userId: string; seat: TableSeat | null }>;

export type MemberRoleDecision =
  | Readonly<{ change: 'changed'; from: CampaignRole; to: CampaignRole }>
  | Readonly<{ change: 'unchanged'; role: CampaignRole }>;

/** Who may put which member in which role: any master swaps players and spectators; only owner
 *  powers (the owner, a juggernaut) promote to master and demote a master; nobody changes the
 *  owner nor a juggernaut (game-core `assignableRolesOf`).
 *
 *  Example: `new MemberRoleBo(campaignId, owner, { userId: biaId, seat: player }).decide('master')` */
export class MemberRoleBo {
  private readonly access: CampaignAccessBo;

  constructor(
    private readonly campaignId: string,
    private readonly requester: SeatedMember,
    private readonly target: SeatedMember,
  ) {
    const role = requester.seat?.role ?? null;
    this.access = new CampaignAccessBo({ campaignId, userId: requester.userId, role });
  }

  /** The change to write, or `unchanged` when the member already has `role`. In this order: a
   *  non-member asking gets CAMPAIGN_NOT_FOUND, a player or a spectator FORBIDDEN, a target
   *  outside the table MEMBER_NOT_FOUND, the owner or a juggernaut as the target FORBIDDEN, and a
   *  change beyond the requester's powers FORBIDDEN citing "owner powers".
   *
   *  Example: `bo.decide('spectator') // { change: 'changed', from: 'master', to: 'spectator' }` */
  decide(role: CampaignRole): MemberRoleDecision {
    this.access.requireMaster(`change the role of member ${this.target.userId}`);
    const targetSeat = this.unlockedTargetSeat();
    if (targetSeat.role === role) return { change: 'unchanged', role };
    const actorSeat = this.requester.seat;
    if (actorSeat && assignableRolesOf(actorSeat, targetSeat).includes(role)) {
      return { change: 'changed', from: targetSeat.role, to: role };
    }
    return this.access.forbid(
      `put member ${this.target.userId} in the role ${role}`,
      'owner powers',
    );
  }

  private unlockedTargetSeat(): TableSeat {
    const { userId, seat } = this.target;
    const by = this.requester.userId;
    if (!seat) throw new MemberNotFoundError(this.campaignId, userId);
    if (seat.owner) throw new OwnerRoleLockedError(this.campaignId, by, userId);
    if (seat.juggernaut) throw new JuggernautRoleLockedError(this.campaignId, by, userId);
    return seat;
  }
}
