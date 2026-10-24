import type { CampaignAccessBo, CampaignRole } from './campaign-access.bo';
import { MasterRoleLockedError, MemberNotFoundError } from './campaigns.error';

/** The roles the master hands out and takes back; nobody becomes master by a change. */
export type AssignableRole = Exclude<CampaignRole, 'master'>;

/** The member whose role is asked to change, and their role now (`null` = not on the table). */
export type MemberRoleTarget = Readonly<{ userId: string; role: CampaignRole | null }>;

export type MemberRoleDecision =
  | Readonly<{ change: 'changed'; from: AssignableRole; to: AssignableRole }>
  | Readonly<{ change: 'unchanged'; role: AssignableRole }>;

/** Who may move a member between player and spectator: only the master, never on the master.
 *
 *  Example: `new MemberRoleBo(access, { userId: dudaId, role: 'spectator' }).decide('player')` */
export class MemberRoleBo {
  constructor(
    private readonly access: CampaignAccessBo,
    private readonly target: MemberRoleTarget,
  ) {}

  /** The change to write, or `unchanged` when the member already has `role` (asking again is
   *  harmless). A non-member asking gets CAMPAIGN_NOT_FOUND, a player or a spectator FORBIDDEN,
   *  an id outside the table MEMBER_NOT_FOUND, and the master as the target FORBIDDEN.
   *
   *  Example: `bo.decide('spectator') // { change: 'changed', from: 'player', to: 'spectator' }` */
  decide(role: AssignableRole): MemberRoleDecision {
    const { userId } = this.target;
    this.access.requireMaster(`change the role of member ${userId}`);
    const from = this.currentRole();
    if (from === role) return { change: 'unchanged', role };
    return { change: 'changed', from, to: role };
  }

  private currentRole(): AssignableRole {
    const { userId, role } = this.target;
    const campaignId = this.access.campaignIdOf();
    if (role === null) throw new MemberNotFoundError(campaignId, userId);
    if (role !== 'master') return role;
    throw new MasterRoleLockedError(campaignId, this.access.userIdOf(), userId);
  }
}
