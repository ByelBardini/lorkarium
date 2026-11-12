import { expect, type Page } from '@playwright/test';

// The names of `USER_PLANS` (packages/contracts/src/plans/user-plan.dto.ts): change both together.
export type UserPlanName = 'free' | 'narrador' | 'lenda' | 'amigo_do_dono';

/** Puts the account with this @ on `plan` through the backoffice route, with the cookie of the
 *  admin's page: the setup of a spec that needs a plan other than the one the account has (an
 *  account the e2e creates is born `free`; Bia and Caio are seeded `amigo_do_dono`).
 *
 *  Example: `await setPlanOf(admin, 'bia', 'free')` */
export async function setPlanOf(admin: Page, username: string, plan: UserPlanName): Promise<void> {
  const userId = await userIdOf(admin, username);
  const response = await admin.request.patch(`/api/admin/users/${userId}/plan`, {
    data: { plan },
  });
  expect(response.status(), `plan of @${username} to ${plan}`).toBe(200);
}

async function userIdOf(admin: Page, username: string): Promise<string> {
  const response = await admin.request.get('/api/admin/users');
  expect(response.status(), 'GET /api/admin/users').toBe(200);
  const body: unknown = await response.json();
  const users: unknown =
    typeof body === 'object' && body !== null ? Reflect.get(body, 'users') : [];
  const found = Array.isArray(users)
    ? users.find((user: unknown) => Reflect.get(Object(user), 'username') === username)
    : undefined;
  const id: unknown = found ? Reflect.get(Object(found), 'id') : null;
  if (typeof id !== 'string') {
    throw new Error(
      `GET /api/admin/users: expected a user with username "${username}" and an id, received ${JSON.stringify(body)}`,
    );
  }
  return id;
}
