import { PLAN_LIMITS, accountPlanDto, meResponseDto, type UserPlan } from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { users } from '../../src/modules/auth/users.po';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

// Ana owns Vharn (Bia and Caio play there); Caio owns Quelm.
const live = useTokenTable();
const ACCOUNT_PLAN_URL = '/api/account/plan';

async function setAccount(
  user: SignedInUser,
  changes: { plan?: UserPlan; role?: 'user' | 'admin' },
): Promise<void> {
  await live.connection.db.update(users).set(changes).where(eq(users.id, user.id));
}

async function planOf(user: SignedInUser) {
  const response = await live.http(user, { method: 'GET', url: ACCOUNT_PLAN_URL });
  expect(response.statusCode).toBe(200);
  return accountPlanDto.parse(response.json());
}

async function meOf(user: SignedInUser) {
  const response = await live.http(user, { method: 'GET', url: '/api/auth/me' });
  const { user: me } = meResponseDto.parse(response.json());
  if (!me) throw new Error(`/me of ${user.id} answered no user: ${response.body}`);
  return me;
}

describe('GET /api/account/plan', () => {
  it('Bia on free owning one table gets the free plan, its limits and one table owned', async () => {
    await setAccount(live.bia, { plan: 'free' });
    const created = await live.http(live.bia, {
      method: 'POST',
      url: '/api/campaigns',
      payload: { name: 'A Torre de Bia' },
    });
    expect(created.statusCode).toBe(201);

    expect(await planOf(live.bia)).toEqual({
      plan: 'free',
      limits: PLAN_LIMITS.free,
      customization: false,
      usage: { campaignsOwned: 1, storageBytes: 0 },
    });
  });

  it("the usage does not count the table Bia only plays in, nor Caio's", async () => {
    expect((await planOf(live.bia)).usage.campaignsOwned).toBe(0);
    expect((await planOf(live.caio)).usage.campaignsOwned).toBe(1);
  });

  it('an admin on free gets the limits of amigo_do_dono', async () => {
    await setAccount(live.ana, { role: 'admin', plan: 'free' });

    const plan = await planOf(live.ana);

    expect(plan).toMatchObject({ plan: 'free', customization: true });
    expect(plan.limits).toEqual(PLAN_LIMITS.amigo_do_dono);
  });

  it('without a session is 401', async () => {
    const response = await live.http(null, { method: 'GET', url: ACCOUNT_PLAN_URL });

    expect(response.statusCode).toBe(401);
  });
});

describe('the plan in GET /api/auth/me', () => {
  it("Bia's /me carries her plan and her limits", async () => {
    await setAccount(live.bia, { plan: 'narrador' });

    expect(await meOf(live.bia)).toMatchObject({
      plan: 'narrador',
      limits: PLAN_LIMITS.narrador,
      customization: true,
    });
  });

  it("an admin's /me carries the stored plan and the limits of amigo_do_dono", async () => {
    await setAccount(live.ana, { role: 'admin', plan: 'free' });

    const me = await meOf(live.ana);

    expect(me.plan).toBe('free');
    expect(me.limits).toEqual(PLAN_LIMITS.amigo_do_dono);
  });
});

describe('the plan in GET /api/account/profile', () => {
  it('the own profile carries the stored plan for the seal', async () => {
    await setAccount(live.bia, { plan: 'lenda' });

    const response = await live.http(live.bia, { method: 'GET', url: '/api/account/profile' });

    expect(response.json()).toMatchObject({ profile: { plan: 'lenda' } });
  });
});
