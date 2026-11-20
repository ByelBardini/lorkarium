import { and, eq, isNotNull, sql, type SQL } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { activePaidPlanSql } from '../auth/users.dao';
import { users } from '../auth/users.po';
import type { StoredSegment } from './mail-broadcasts.po';

/** Who a notice goes to: every active account, the paid plans in force, or one plan on sale. */
export type AudienceSegment = StoredSegment;

/** The accounts of a segment: counted for the draft, frozen as deliveries on confirmation. Every
 *  account is global (a notice of the service is not of one campaign); an account suspended now
 *  never enters, and a paid plan counts only while in force (`activePaidPlanSql`).
 *
 *  Example: `await new BroadcastAudienceDao(db).count({ plan: 'lenda' }) // 42` */
export class BroadcastAudienceDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async count(segment: AudienceSegment): Promise<number> {
    return this.db.$count(users, audienceOf(segment));
  }

  /** One pending delivery per account of `segment`, in one statement; returns how many. */
  async freeze(broadcastId: string, segment: AudienceSegment): Promise<number> {
    const result = await this.db.execute(
      sql`INSERT INTO mail_broadcast_deliveries (broadcast_id, user_id) SELECT ${broadcastId}::uuid, ${users.id} FROM ${users} WHERE ${audienceOf(segment)}`,
    );
    return result.rowCount ?? 0;
  }
}

// Not suspended now: a suspension with an end stops holding at that instant (as at the login),
// before the hourly housekeeping clears the columns.
const ACTIVE: SQL = sql`(${users.suspendedAt} IS NULL OR ${users.suspendedUntil} <= now())`;

function audienceOf(segment: AudienceSegment): SQL {
  const active = ACTIVE;
  if (segment === 'all') return active;
  const paid = activePaidPlanSql();
  if (segment === 'paid') return and(active, isNotNull(paid)) ?? active;
  return and(active, eq(paid, segment.plan)) ?? active;
}
