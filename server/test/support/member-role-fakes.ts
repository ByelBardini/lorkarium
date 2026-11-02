import type { CachedMemberships } from '../../src/modules/campaigns/cached-memberships';
import type {
  MemberRemovedPort,
  MemberRemoval,
} from '../../src/modules/campaigns/member-removed.port';
import type {
  MemberRoleChange,
  MemberRoleChangedPort,
} from '../../src/modules/campaigns/member-role-changed.port';
import type {
  MemberRoleTransactionRunner,
  MemberRoleWriteDaos,
} from '../../src/modules/campaigns/member-role.service';
import type {
  MemberSeatNotice,
  MemberSeatPort,
} from '../../src/modules/campaigns/member-seat.port';
import type { CampaignMembersDaoFake } from './campaigns-fakes';

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

/** The seat of the role's transaction: writes `seat:<userId>:<role>` when the role is saved and
 *  `notice:<userId>` when its notice runs (after the commit), both to `journal`; with `failure`
 *  set, the seat's write throws it (the transaction rolls back).
 *
 *  Example: `new MemberSeatFake(members.writes)` */
export class MemberSeatFake implements MemberSeatPort {
  failure: Error | null = null;

  constructor(private readonly journal: string[]) {}

  async roleSaved(change: MemberRoleChange): Promise<MemberSeatNotice> {
    this.journal.push(`seat:${change.userId}:${change.role}`);
    if (this.failure) throw this.failure;
    return () => this.journal.push(`notice:${change.userId}`);
  }
}

/** Runs the role's work on the members fake and the seat fake, then writes `commit` to the
 *  members' `writes`, like the real transaction.
 *
 *  Example: `new MemberRoleTransactionRunnerFake(members, new MemberSeatFake(members.writes)).run` */
export class MemberRoleTransactionRunnerFake {
  constructor(
    private readonly members: CampaignMembersDaoFake,
    private readonly seat: MemberSeatPort,
  ) {}

  readonly run: MemberRoleTransactionRunner = async <T>(
    work: (daos: MemberRoleWriteDaos) => Promise<T>,
  ): Promise<T> => {
    const result = await work({ members: this.members, seat: this.seat });
    this.members.writes.push('commit');
    return result;
  };
}

/** Writes `<name>:<userId>` to `journal` when told; with `failure`, throws it instead.
 *
 *  Example: `new MemberRemovedFake('sessions', journal)` */
export class MemberRemovedFake implements MemberRemovedPort {
  constructor(
    private readonly name: string,
    private readonly journal: string[],
    private readonly failure: Error | null = null,
  ) {}

  async memberRemoved(removal: MemberRemoval): Promise<void> {
    if (this.failure) throw this.failure;
    this.journal.push(`${this.name}:${removal.userId}`);
  }
}
