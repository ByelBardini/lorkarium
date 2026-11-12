import { apiErrorDto, type UserPlan } from '@lorkarium/contracts';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { users } from '../../src/modules/auth/users.po';
import { campaigns } from '../../src/modules/campaigns/campaigns.po';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

// Ana owns Vharn, Caio owns Quelm; every account signed up here is born free.
const live = useTokenTable();
const RACES = 5;

function createTable(user: SignedInUser, name: string) {
  return live.http(user, { method: 'POST', url: '/api/campaigns', payload: { name } });
}

async function setPlan(user: SignedInUser, plan: UserPlan, role: 'user' | 'admin' = 'user') {
  await live.connection.db.update(users).set({ plan, role }).where(eq(users.id, user.id));
}

async function ownedBy(user: SignedInUser): Promise<number> {
  const counted = await live.connection.db.execute(
    sql`SELECT count(*)::int AS total FROM campaigns WHERE owner_id = ${user.id}`,
  );
  return (counted.rows[0] as { total: number }).total;
}

describe('creating a table against the owner plan', () => {
  it('Bia on free with no table creates the first: 201', async () => {
    const response = await createTable(live.bia, 'A Torre');

    expect(response.statusCode).toBe(201);
  });

  it('Bia on free with one table is refused 403 PLAN_LIMIT, and no table is left behind', async () => {
    await createTable(live.bia, 'A Torre');

    const response = await createTable(live.bia, 'A Segunda Torre');

    expect(response.statusCode).toBe(403);
    expect(apiErrorDto.parse(response.json())).toMatchObject({
      code: 'PLAN_LIMIT',
      planLimit: { resource: 'campaigns', limit: 1, plan: 'free' },
    });
    expect(await ownedBy(live.bia)).toBe(1);
  });

  it('two creations at once of a free owner with no table: exactly one 201 and one 403', async () => {
    for (let race = 0; race < RACES; race += 1) {
      const racer = await live.signUp(`Racer${race}`);

      const answers = await Promise.all([createTable(racer, 'Uma'), createTable(racer, 'Outra')]);

      expect(answers.map((answer) => answer.statusCode).sort()).toEqual([201, 403]);
      expect(await ownedBy(racer)).toBe(1);
    }
  });

  it('a finished table still counts against the plan', async () => {
    await createTable(live.bia, 'A Torre');
    await live.connection.db
      .update(campaigns)
      .set({ status: 'finished' })
      .where(eq(campaigns.ownerId, live.bia.id));

    expect((await createTable(live.bia, 'Outra')).statusCode).toBe(403);
  });

  it('Caio on amigo_do_dono and an admin on free have no ceiling of tables', async () => {
    await setPlan(live.caio, 'amigo_do_dono');
    await setPlan(live.ana, 'free', 'admin');

    expect((await createTable(live.caio, 'Segunda de Caio')).statusCode).toBe(201);
    expect((await createTable(live.ana, 'Segunda de Ana')).statusCode).toBe(201);
  });
});
