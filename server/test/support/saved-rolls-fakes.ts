import type { SavedRollsDao } from '../../src/modules/saved-rolls/saved-rolls.dao';
import type {
  NewSavedRollPo,
  SavedRollChangesPo,
  SavedRollPo,
} from '../../src/modules/saved-rolls/saved-rolls.po';
import type {
  SavedRollWriteDaos,
  SavedRollsTransactionRunner,
} from '../../src/modules/saved-rolls/saved-rolls.service';
import { BIA_ID, VHARN_ID } from './campaigns-factories';

export const ACERTO_ID = '7f3e2d1c-0b9a-4c8d-9e7f-6a5b4c3d2e1f';
const FAKE_DATE = new Date('2026-10-25T12:00:00Z');

/** The saved roll "Acerto" (`1d20+5`) of Bia at Vharn.
 *
 *  Example: `savedRollPo({ name: 'Bênção', nameKey: 'bencao' })` */
export function savedRollPo(overrides: Partial<SavedRollPo> = {}): SavedRollPo {
  return {
    id: ACERTO_ID,
    campaignId: VHARN_ID,
    userId: BIA_ID,
    name: 'Acerto',
    nameKey: 'acerto',
    parts: [{ label: null, expression: '1d20+5' }],
    createdAt: FAKE_DATE,
    updatedAt: FAKE_DATE,
    ...overrides,
  };
}

/** What Drizzle throws when `saved_rolls_member_name_unique` refuses a repeated name. */
export class SavedRollNameViolationFake extends Error {
  override readonly cause = { code: '23505', constraint: 'saved_rolls_member_name_unique' };
}

/** In-memory saved rolls; a repeated name key of the same owner throws like the unique index.
 *  Writes `lock`, `count`, `insert:<name>`, `update:<id>` and `remove:<id>` in the journal. */
export class SavedRollsDaoFake implements Pick<
  SavedRollsDao,
  'listOf' | 'countOf' | 'lockOwner' | 'insert' | 'update' | 'remove'
> {
  /** Owners (`<campaign>:<user>`) still at the table; `lockOwner` answers from it. */
  readonly owners = new Set<string>([`${VHARN_ID}:${BIA_ID}`]);

  constructor(
    private readonly journal: string[],
    readonly rows: SavedRollPo[] = [],
  ) {}

  async listOf(campaignId: string, userId: string): Promise<SavedRollPo[]> {
    this.journal.push('list');
    return this.rows.filter((row) => row.campaignId === campaignId && row.userId === userId);
  }

  async countOf(campaignId: string, userId: string): Promise<number> {
    this.journal.push('count');
    return this.rows.filter((row) => row.campaignId === campaignId && row.userId === userId).length;
  }

  async lockOwner(campaignId: string, userId: string): Promise<boolean> {
    this.journal.push('lock');
    return this.owners.has(`${campaignId}:${userId}`);
  }

  async insert(row: NewSavedRollPo): Promise<SavedRollPo> {
    this.requireFreeName(row.campaignId, row.userId, row.nameKey, null);
    this.journal.push(`insert:${row.name}`);
    const inserted = savedRollPo({ ...row, id: `roll-${this.rows.length + 1}` });
    this.rows.push(inserted);
    return inserted;
  }

  async update(
    campaignId: string,
    userId: string,
    savedRollId: string,
    changes: SavedRollChangesPo,
  ): Promise<SavedRollPo | undefined> {
    const index = this.indexOf(campaignId, userId, savedRollId);
    if (index < 0) return undefined;
    if (changes.nameKey) this.requireFreeName(campaignId, userId, changes.nameKey, savedRollId);
    this.journal.push(`update:${savedRollId}`);
    const updated = { ...(this.rows[index] as SavedRollPo), ...changes };
    this.rows[index] = updated;
    return updated;
  }

  async remove(campaignId: string, userId: string, savedRollId: string): Promise<boolean> {
    const index = this.indexOf(campaignId, userId, savedRollId);
    if (index < 0) return false;
    this.journal.push(`remove:${savedRollId}`);
    this.rows.splice(index, 1);
    return true;
  }

  private indexOf(campaignId: string, userId: string, savedRollId: string): number {
    return this.rows.findIndex(
      (row) => row.campaignId === campaignId && row.userId === userId && row.id === savedRollId,
    );
  }

  private requireFreeName(
    campaignId: string,
    userId: string,
    nameKey: string,
    exceptId: string | null,
  ): void {
    const taken = this.rows.some(
      (row) =>
        row.campaignId === campaignId &&
        row.userId === userId &&
        row.nameKey === nameKey &&
        row.id !== exceptId,
    );
    if (taken)
      throw new SavedRollNameViolationFake('duplicate key value violates unique constraint');
  }
}

/** Runs the work on the fakes and writes 'commit' once it resolved, like the real transaction;
 *  a work that throws writes nothing. */
export class SavedRollsTransactionRunnerFake {
  constructor(
    private readonly journal: string[],
    private readonly daos: SavedRollWriteDaos,
  ) {}

  readonly run: SavedRollsTransactionRunner = async (work) => {
    const result = await work(this.daos);
    this.journal.push('commit');
    return result;
  };
}
