import type { HousekeepingDao, SweptTable } from '../../src/modules/housekeeping/housekeeping.dao';
import type { HousekeepingFailureLog } from '../../src/modules/housekeeping/housekeeping.service';

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

/** Keeps every error the housekeeping logs. */
export class HousekeepingFailureLogFake implements HousekeepingFailureLog {
  readonly errors: Readonly<{ fields: object; message: string }>[] = [];

  error(fields: object, message: string): void {
    this.errors.push({ fields, message });
  }
}
