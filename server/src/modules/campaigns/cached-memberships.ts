import type { CampaignMemberRow, CampaignMembersDao } from './campaign-members.dao';
import type { CampaignMemberPo } from './campaign-members.po';

/** What the board modules read of the members: who is in a table, with which role, and the list. */
export type MembershipReader = Pick<CampaignMembersDao, 'findMembership' | 'listMembers'>;

/** Memberships kept before the memory starts over (8 players × many open tables, with room). */
export const MEMBERSHIP_MEMORY_MAX = 4096;

/** The members DAO with a memory of who **is** a member, so a board command does not read the
 *  membership again. Only positives are kept: someone who joins by code right after a refusal
 *  must be accepted. A role change calls `forget` (and so will leaving a table, when it exists).
 *  A deleted account calls `forgetUser`, a deleted campaign `forgetCampaign`. One server instance only (spec §5.7).
 *
 *  Example: `const members = new CachedMemberships(new CampaignMembersDao(db))` */
export class CachedMemberships implements MembershipReader {
  private readonly known = new Map<string, CampaignMemberPo>();

  constructor(
    private readonly members: MembershipReader,
    private readonly limit: number = MEMBERSHIP_MEMORY_MAX,
  ) {}

  async findMembership(campaignId: string, userId: string): Promise<CampaignMemberPo | undefined> {
    const key = keyOf(campaignId, userId);
    const kept = this.known.get(key);
    if (kept) return kept;
    const row = await this.members.findMembership(campaignId, userId);
    if (row) this.remember(key, row);
    return row;
  }

  /** The list is read every time: it changes when someone joins by code. */
  listMembers(campaignId: string): Promise<CampaignMemberRow[]> {
    return this.members.listMembers(campaignId);
  }

  /** For a member who leaves the table or changes role: the next read goes to the database. */
  forget(campaignId: string, userId: string): void {
    this.known.delete(keyOf(campaignId, userId));
  }

  /** For a deleted account: every table it was remembered in is read again. */
  forgetUser(userId: string): void {
    const suffix = `:${userId}`;
    for (const key of [...this.known.keys()]) {
      if (key.endsWith(suffix)) this.known.delete(key);
    }
  }

  /** For a deleted campaign: nobody keeps commanding a table that is gone. */
  forgetCampaign(campaignId: string): void {
    const prefix = `${campaignId}:`;
    for (const key of [...this.known.keys()]) {
      if (key.startsWith(prefix)) this.known.delete(key);
    }
  }

  private remember(key: string, row: CampaignMemberPo): void {
    if (this.known.size >= this.limit) this.known.clear();
    this.known.set(key, row);
  }
}

function keyOf(campaignId: string, userId: string): string {
  return `${campaignId}:${userId}`;
}
