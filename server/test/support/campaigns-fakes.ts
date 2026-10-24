import type { CampaignCodePort } from '../../src/modules/campaigns/campaign-code.port';
import type {
  CampaignListingRow,
  CampaignMemberRow,
  CampaignMembersDao,
} from '../../src/modules/campaigns/campaign-members.dao';
import type {
  CampaignMemberPo,
  NewCampaignMemberPo,
} from '../../src/modules/campaigns/campaign-members.po';
import type { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import type { CampaignPo, NewCampaignPo } from '../../src/modules/campaigns/campaigns.po';
import type {
  CampaignTransactionRunner,
  CampaignWriteDaos,
} from '../../src/modules/campaigns/campaigns.service';
import { campaignPo } from './campaigns-factories';

const FAKE_DATE = new Date('2026-10-01T12:00:00Z');

/** A random-index source that answers a fixed sequence and records each bound it was asked for.
 *
 *  Example: `new CryptoCampaignCode(new IndexSourceFake([0, 1]).next)` */
export class IndexSourceFake {
  readonly bounds: number[] = [];
  private position = 0;

  constructor(private readonly indexes: readonly number[]) {}

  readonly next = (exclusiveMax: number): number => {
    this.bounds.push(exclusiveMax);
    const index = this.indexes[this.position % this.indexes.length] ?? 0;
    this.position += 1;
    return index;
  };
}

/** Hands out the given codes in order; `generated` lists what it gave. */
export class CampaignCodeFake implements CampaignCodePort {
  readonly generated: string[] = [];

  constructor(private readonly codes: readonly string[]) {}

  generate(): string {
    const code = this.codes[this.generated.length];
    if (!code) throw new Error(`CampaignCodeFake ran out after ${this.generated.length} codes`);
    this.generated.push(code);
    return code;
  }
}

/** What the `pg` driver throws, wrapped by Drizzle, on a unique violation. */
export class UniqueViolationFake extends Error {
  override readonly cause = { code: '23505' };
}

/** In-memory campaigns table; a repeated join code throws like the unique index does. */
export class CampaignsDaoFake implements Pick<
  CampaignsDao,
  'insert' | 'findById' | 'findByJoinCode' | 'setActiveScene'
> {
  constructor(readonly rows: CampaignPo[] = []) {}

  async insert(campaign: NewCampaignPo): Promise<CampaignPo> {
    if (this.rows.some((row) => row.joinCode === campaign.joinCode)) {
      throw new UniqueViolationFake(`join code ${campaign.joinCode} taken`);
    }
    const row = campaignPo({ id: `campaign-${this.rows.length + 1}`, ...campaign });
    this.rows.push(row);
    return row;
  }

  async findById(campaignId: string): Promise<CampaignPo | undefined> {
    return this.rows.find((row) => row.id === campaignId);
  }

  async findByJoinCode(joinCode: string): Promise<CampaignPo | undefined> {
    return this.rows.find((row) => row.joinCode === joinCode);
  }

  async setActiveScene(campaignId: string, sceneId: string): Promise<void> {
    const row = this.rows.find((candidate) => candidate.id === campaignId);
    if (!row) throw new Error(`CampaignsDaoFake has no campaign ${campaignId}`);
    row.activeSceneId = sceneId;
  }
}

/** In-memory campaign_members; names come from `userNames`, listings from `campaigns.rows`.
 *  `listedFor` records `listOfUser` calls and `membersListedFor` records `listMembers` calls. */
export class CampaignMembersDaoFake implements Pick<
  CampaignMembersDao,
  'insert' | 'findMembership' | 'listOfUser' | 'listMembers' | 'markEntered' | 'campaignIdsOfUser'
> {
  readonly listedFor: string[] = [];
  readonly membersListedFor: string[] = [];
  readonly entered: Array<{ campaignId: string; userId: string; at: Date }> = [];

  constructor(
    private readonly campaigns: CampaignsDaoFake,
    private readonly userNames: Readonly<Record<string, string>>,
    readonly rows: CampaignMemberPo[] = [],
  ) {}

  async insert(member: NewCampaignMemberPo): Promise<CampaignMemberPo> {
    const row = { joinedAt: FAKE_DATE, lastEnteredAt: null, ...member };
    this.rows.push(row);
    return row;
  }

  async findMembership(campaignId: string, userId: string): Promise<CampaignMemberPo | undefined> {
    return this.rows.find((row) => row.campaignId === campaignId && row.userId === userId);
  }

  async listOfUser(userId: string): Promise<CampaignListingRow[]> {
    this.listedFor.push(userId);
    return this.rows.filter((row) => row.userId === userId).map((row) => this.listingOf(row));
  }

  async listMembers(campaignId: string): Promise<CampaignMemberRow[]> {
    this.membersListedFor.push(campaignId);
    return this.rows
      .filter((row) => row.campaignId === campaignId)
      .map((row) => memberRowOf(row, this.nameOf(row.userId)));
  }

  async campaignIdsOfUser(userId: string): Promise<string[]> {
    return this.rows.filter((row) => row.userId === userId).map((row) => row.campaignId);
  }

  async markEntered(campaignId: string, userId: string, at: Date): Promise<void> {
    this.entered.push({ campaignId, userId, at });
  }

  private listingOf(row: CampaignMemberPo): CampaignListingRow {
    const members = this.rows.filter((member) => member.campaignId === row.campaignId);
    const master = members.find((member) => member.role === 'master');
    const campaign = this.campaigns.rows.find((candidate) => candidate.id === row.campaignId);
    if (!campaign || !master) throw new Error(`fake has no campaign/master for ${row.campaignId}`);
    return {
      campaign,
      role: row.role,
      joinedAt: row.joinedAt,
      lastEnteredAt: row.lastEnteredAt,
      masterName: this.nameOf(master.userId),
      memberCount: members.length,
    };
  }

  private nameOf(userId: string): string {
    return this.userNames[userId] ?? `unknown ${userId}`;
  }
}

/** Runs the work on the given DAOs and records, in order, every write made inside a transaction. */
export class TransactionRunnerFake {
  readonly writesInside: string[] = [];
  runs = 0;

  constructor(private readonly daos: CampaignWriteDaos) {}

  readonly run: CampaignTransactionRunner = async (work) => {
    this.runs += 1;
    return work({
      campaigns: {
        insert: (row) => this.record('campaigns.insert', () => this.daos.campaigns.insert(row)),
        setActiveScene: (campaignId, sceneId) =>
          this.record('campaigns.setActiveScene', () =>
            this.daos.campaigns.setActiveScene(campaignId, sceneId),
          ),
      },
      members: {
        insert: (row) => this.record('members.insert', () => this.daos.members.insert(row)),
      },
      scenes: {
        insert: (row) => this.record('scenes.insert', () => this.daos.scenes.insert(row)),
      },
      conditions: {
        insertDefinitions: (campaignId, list) =>
          this.record('conditions.insertDefinitions', () =>
            this.daos.conditions.insertDefinitions(campaignId, list),
          ),
      },
    });
  };

  private async record<T>(write: string, perform: () => Promise<T>): Promise<T> {
    const result = await perform();
    this.writesInside.push(write);
    return result;
  }
}

/** The condition definitions a fake transaction seeded, by campaign. */
export class ConditionDefinitionsFake {
  readonly seeded = new Map<string, readonly string[]>();

  async insertDefinitions(
    campaignId: string,
    list: readonly Readonly<{ name: string }>[],
  ): Promise<void> {
    this.seeded.set(
      campaignId,
      list.map(({ name }) => name),
    );
  }
}

/** The memberships table as `findMembership` reads it; `reads` keeps each `<campaign>:<user>` asked.
 *
 *  Example: `const dao = new MembershipReadsFake([campaignMemberPo()]); dao.reads.length` */
export class MembershipReadsFake implements Pick<
  CampaignMembersDao,
  'findMembership' | 'listMembers'
> {
  readonly reads: string[] = [];

  constructor(readonly rows: CampaignMemberPo[] = []) {}

  async listMembers(campaignId: string): Promise<CampaignMemberRow[]> {
    this.reads.push(`list:${campaignId}`);
    const members = this.rows.filter((row) => row.campaignId === campaignId);
    return members.map((row) => memberRowOf(row, row.userId));
  }

  async findMembership(campaignId: string, userId: string): Promise<CampaignMemberPo | undefined> {
    this.reads.push(`${campaignId}:${userId}`);
    return this.rows.find((row) => row.campaignId === campaignId && row.userId === userId);
  }
}

// A member as `listMembers` reads it: no chosen color, photo or bio unless a spec sets them.
function memberRowOf(row: CampaignMemberPo, name: string): CampaignMemberRow {
  const username = name.toLowerCase();
  return {
    userId: row.userId,
    name,
    username,
    colorChoice: null,
    avatarId: null,
    bio: null,
    role: row.role,
  };
}
