import { sql, type SQL } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';

/** One table the housekeeping empties: the rows older than a cut, at most `limit` per call. */
export type SweptTable = 'document_receipts' | 'sheet_receipts' | 'sessions' | 'challenges';

// Which column dates a row: a receipt by when it was kept, a session or a 2FA step by when it ends.
const DATED_BY: Readonly<Record<SweptTable, Readonly<{ table: string; column: string }>>> = {
  document_receipts: { table: 'library_document_actions', column: 'created_at' },
  sheet_receipts: { table: 'sheet_actions', column: 'created_at' },
  sessions: { table: 'auth_sessions', column: 'expires_at' },
  challenges: { table: 'two_factor_challenges', column: 'expires_at' },
};

/** Deletes old rows a batch at a time, so a long backlog never holds one big lock. Every table
 *  is global (not of one campaign): a receipt, a session and a challenge are all past use.
 *
 *  Example: `await new HousekeepingDao(db).deleteBefore('sessions', now, 1000) // rows gone` */
export class HousekeepingDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async deleteBefore(swept: SweptTable, cut: Date, limit: number): Promise<number> {
    const result = await this.db.execute(batchDeleteOf(swept, cut, limit));
    return result.rowCount ?? 0;
  }
}

function batchDeleteOf(swept: SweptTable, cut: Date, limit: number): SQL {
  const { table, column } = DATED_BY[swept];
  const name = sql.identifier(table);
  const dated = sql.identifier(column);
  return sql`DELETE FROM ${name} WHERE ctid IN (SELECT ctid FROM ${name} WHERE ${dated} < ${cut.toISOString()} LIMIT ${limit})`;
}
