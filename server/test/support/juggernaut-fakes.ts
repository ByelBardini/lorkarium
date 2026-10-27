import type {
  CampaignMembersDao,
  JuggernautEnd,
} from '../../src/modules/campaigns/campaign-members.dao';
import type { CampaignMemberPo } from '../../src/modules/campaigns/campaign-members.po';
import type {
  MemberRemoval,
  MemberRemovedPort,
} from '../../src/modules/campaigns/member-removed.port';
import { CampaignMembersDaoFake } from './campaigns-fakes';

type JuggernautWrites = Pick<
  CampaignMembersDao,
  'startJuggernaut' | 'endJuggernaut' | 'juggernautCampaignIdsOf'
>;

/** The members fake with the juggernaut columns, as the DAO writes them; each write goes to
 *  `writes` as `startJuggernaut:<campaignId>:<userId>` or `endJuggernaut:<campaignId>:<userId>`.
 *
 *  Example: `new JuggernautMembersFake(campaigns, names, [campaignMemberPo()])` */
export class JuggernautMembersFake extends CampaignMembersDaoFake implements JuggernautWrites {
  async startJuggernaut(campaignId: string, userId: string, at: Date): Promise<CampaignMemberPo> {
    this.writes.push(`startJuggernaut:${campaignId}:${userId}`);
    const index = this.indexOf(campaignId, userId);
    const before = this.rows[index];
    const fresh = { campaignId, userId, joinedAt: at, lastEnteredAt: null };
    const row: CampaignMemberPo = before
      ? { ...before, role: 'master', ...this.modeKeptFrom(before, at) }
      : { ...fresh, role: 'master', juggernautSince: at, roleBeforeJuggernaut: null };
    if (index >= 0) this.rows[index] = row;
    else this.rows.push(row);
    return row;
  }

  async endJuggernaut(campaignId: string, userId: string): Promise<JuggernautEnd | undefined> {
    this.writes.push(`endJuggernaut:${campaignId}:${userId}`);
    const index = this.indexOf(campaignId, userId);
    const row = this.rows[index];
    if (!row || row.juggernautSince === null) return undefined;
    const restored = row.roleBeforeJuggernaut;
    if (restored === null) this.rows.splice(index, 1);
    else this.rows[index] = { ...row, role: restored, ...NO_MODE };
    return { restored };
  }

  async juggernautCampaignIdsOf(userId: string): Promise<string[]> {
    const inMode = this.rows.filter((row) => row.userId === userId && row.juggernautSince);
    return inMode.map((row) => row.campaignId);
  }

  private indexOf(campaignId: string, userId: string): number {
    return this.rows.findIndex((row) => row.campaignId === campaignId && row.userId === userId);
  }

  private modeKeptFrom(row: CampaignMemberPo, at: Date): Pick<CampaignMemberPo, ModeColumns> {
    if (row.juggernautSince) return { ...pickMode(row) };
    return { juggernautSince: at, roleBeforeJuggernaut: row.role };
  }
}

type ModeColumns = 'juggernautSince' | 'roleBeforeJuggernaut';

const NO_MODE: Pick<CampaignMemberPo, ModeColumns> = {
  juggernautSince: null,
  roleBeforeJuggernaut: null,
};

function pickMode(row: CampaignMemberPo): Pick<CampaignMemberPo, ModeColumns> {
  return { juggernautSince: row.juggernautSince, roleBeforeJuggernaut: row.roleBeforeJuggernaut };
}

/** Records each member taken out of a live table and writes `memberRemoved:<userId>` to
 *  `journal` (share the members fake's `writes` to read the order).
 *
 *  Example: `new MemberRemovedFake(members.writes).removed // [{ campaignId, userId }]` */
export class MemberRemovedFake implements MemberRemovedPort {
  readonly removed: MemberRemoval[] = [];

  constructor(private readonly journal: string[]) {}

  async memberRemoved(removal: MemberRemoval): Promise<void> {
    this.removed.push(removal);
    this.journal.push(`memberRemoved:${removal.userId}`);
  }
}
