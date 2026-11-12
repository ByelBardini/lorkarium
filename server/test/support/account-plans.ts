import type { UserPlan } from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import type { Database } from '../../src/database/database';
import { users } from '../../src/modules/auth/users.po';

/** Puts the account on `plan`, straight in the database: a test account is born `free`, so a
 *  spec about what a table did before the plans (no plan limit) gives its owner `amigo_do_dono`.
 *
 *  Example: `beforeEach(() => setAccountPlan(live.connection.db, live.ana.id, 'amigo_do_dono'))` */
export async function setAccountPlan(db: Database, userId: string, plan: UserPlan): Promise<void> {
  await db.update(users).set({ plan }).where(eq(users.id, userId));
}
