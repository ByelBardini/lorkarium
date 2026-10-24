import type { CachedMemberships } from '../../src/modules/campaigns/cached-memberships';
import type {
  MemberRoleChange,
  MemberRoleChangedPort,
} from '../../src/modules/campaigns/member-role-changed.port';

/** Writes `forget:<campaignId>:<userId>` to `journal` (share the members fake's `writes`, so
 *  a spec reads updateRole → forget → tell in one list).
 *
 *  Example: `new ForgottenMembershipsFake(members.writes)` */
export class ForgottenMembershipsFake implements Pick<CachedMemberships, 'forget'> {
  constructor(private readonly journal: string[]) {}

  forget(campaignId: string, userId: string): void {
    this.journal.push(`forget:${campaignId}:${userId}`);
  }
}

/** Records each role change told to the live table, with the entries of `journal` already
 *  written when it was told (`writesBefore`), and writes `memberRoleChanged:<userId>:<role>`.
 *
 *  Example: `changed.told[0]?.writesBefore // ['updateRole:…', 'forget:…']` */
export class MemberRoleChangedFake implements MemberRoleChangedPort {
  readonly told: Array<{ change: MemberRoleChange; writesBefore: string[] }> = [];

  constructor(private readonly journal: string[]) {}

  async memberRoleChanged(change: MemberRoleChange): Promise<void> {
    this.told.push({ change, writesBefore: [...this.journal] });
    this.journal.push(`memberRoleChanged:${change.userId}:${change.role}`);
  }
}
