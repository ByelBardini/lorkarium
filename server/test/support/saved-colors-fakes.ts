import type { UserPlanPo } from '../../src/modules/auth/users.po';
import type { SavedColorPo } from '../../src/modules/saved-colors/saved-colors.po';
import type {
  SavedColorWriteDao,
  SavedColorsServiceDeps,
  SavedColorsTransactionRunner,
} from '../../src/modules/saved-colors/saved-colors.service';
import { BIA_ID } from './campaigns-factories';
import { planAccount } from './plan-account-fakes';

const FAKE_DATE = new Date('2026-11-08T12:00:00Z');

/** One saved color of Bia.
 *
 *  Example: `savedColorPo('#336699')` */
export function savedColorPo(color: SavedColorPo['color']): SavedColorPo {
  return { userId: BIA_ID, color, createdAt: FAKE_DATE };
}

/** The list of one account in memory, newest first; `journal` records each call in order, and
 *  `account` is the plan the lock answers (`amigo_do_dono` unless set). */
export class SavedColorsDaoFake implements SavedColorWriteDao, SavedColorsWriteOutsideTx {
  readonly journal: string[] = [];
  account: UserPlanPo = planAccount();

  constructor(public rows: SavedColorPo[] = []) {}

  async lockOwner(): Promise<UserPlanPo | undefined> {
    this.journal.push('lock');
    return this.account;
  }

  async listOf(): Promise<SavedColorPo[]> {
    this.journal.push('list');
    return [...this.rows];
  }

  async insertIfAbsent(
    _userId: string,
    color: SavedColorPo['color'],
  ): Promise<SavedColorPo | undefined> {
    this.journal.push('insert');
    if (this.rows.some((row) => row.color === color)) return undefined;
    const row = savedColorPo(color);
    this.rows = [row, ...this.rows];
    return row;
  }

  async remove(_userId: string, color: SavedColorPo['color']): Promise<void> {
    this.journal.push('remove');
    this.rows = this.rows.filter((row) => row.color !== color);
  }
}

type SavedColorsWriteOutsideTx = SavedColorsServiceDeps['colors'];

/** Runs the work on the same fake; writes `commit` or `rollback` to its journal. */
export class SavedColorsTransactionRunnerFake {
  constructor(private readonly colors: SavedColorsDaoFake) {}

  readonly run: SavedColorsTransactionRunner = async (work) => {
    try {
      const result = await work(this.colors);
      this.colors.journal.push('commit');
      return result;
    } catch (failure) {
      this.colors.journal.push('rollback');
      throw failure;
    }
  };
}
