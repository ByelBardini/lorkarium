import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { PLAN_ACCOUNT_COLUMNS } from '../auth/users.dao';
import { users, type UserPlanPo } from '../auth/users.po';

/** Reads what decides the limits of one account, without a lock: for showing them ("Seu plano"),
 *  never for deciding a write (that one reads under `UsersDao.lockForPlan` or
 *  `CampaignsDao.lockWithOwner`). */
export class PlansDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** The role, plan and Dono flag of `userId`; `undefined` when the account is gone.
   *
   *  Example: `await plansDao.accountOf(userId) // { role: 'user', plan: 'free', lorkariumOwner: false }` */
  async accountOf(userId: string): Promise<UserPlanPo | undefined> {
    const [row] = await this.db
      .select(PLAN_ACCOUNT_COLUMNS)
      .from(users)
      .where(eq(users.id, userId));
    return row;
  }
}
