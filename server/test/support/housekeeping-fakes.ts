import type { HousekeepingDao, SweptTable } from '../../src/modules/housekeeping/housekeeping.dao';
import type { HousekeepingFailureLog } from '../../src/modules/housekeeping/housekeeping.service';
import type { SuspensionEndedPort } from '../../src/modules/housekeeping/suspension-ended.port';
import type { UserPo } from '../../src/modules/auth/users.po';

/** Answers each `deleteBefore` from a queue per table (`0` when it runs out) and records every
 *  call; `failure` makes the next call reject. */
export class HousekeepingDaoFake implements Pick<HousekeepingDao, 'deleteBefore'> {
  readonly calls: Readonly<{ swept: SweptTable; cut: Date; limit: number }>[] = [];
  readonly deletions: Partial<Record<SweptTable, number[]>> = {};
  failure: Error | null = null;

  async deleteBefore(swept: SweptTable, cut: Date, limit: number): Promise<number> {
    this.calls.push({ swept, cut, limit });
    if (this.failure) throw this.failure;
    return this.deletions[swept]?.shift() ?? 0;
  }

  /** The tables asked, in order. */
  sweptTables(): SweptTable[] {
    return this.calls.map(({ swept }) => swept);
  }
}

/** Answers each `liftExpiredSuspensions` from a queue of batches (`[]` when it runs out) and
 *  records each cut. */
export class ExpiredSuspensionsDaoFake implements Pick<HousekeepingDao, 'liftExpiredSuspensions'> {
  readonly lifts: Readonly<{ now: Date; limit: number }>[] = [];
  readonly batches: UserPo[][] = [];

  async liftExpiredSuspensions(now: Date, limit: number): Promise<UserPo[]> {
    this.lifts.push({ now, limit });
    return this.batches.shift() ?? [];
  }
}

/** Records the account of each "your access is back" notice; `failingFor` rejects for that id. */
export class SuspensionEndedFake implements SuspensionEndedPort {
  readonly told: string[] = [];
  failingFor: string | null = null;

  async suspensionEnded(account: UserPo): Promise<void> {
    if (account.id === this.failingFor) throw new Error(`smtp down for ${account.id}`);
    this.told.push(account.id);
  }
}

/** Keeps every error the housekeeping logs. */
/** The measures' follow-up of the hourly sweep: counts the sweeps; `failure` makes it throw. */
export class SanctionFollowUpFake {
  sweeps = 0;
  failure: Error | null = null;

  async sweep(): Promise<void> {
    if (this.failure) throw this.failure;
    this.sweeps += 1;
  }
}

export class HousekeepingFailureLogFake implements HousekeepingFailureLog {
  readonly errors: Readonly<{ fields: object; message: string }>[] = [];

  error(fields: object, message: string): void {
    this.errors.push({ fields, message });
  }
}
