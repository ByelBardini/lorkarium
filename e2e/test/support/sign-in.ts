import { expect, type Page } from '@playwright/test';

export type Credentials = Readonly<{ email: string; password: string }>;

/** The admin the server seeds at boot (ADMIN_EMAIL / ADMIN_PASSWORD).
 *
 *  Example: `await signIn(page, adminCredentials())` */
export function adminCredentials(): Credentials {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      `the e2e signs in with the seeded admin; expected ADMIN_EMAIL and ADMIN_PASSWORD, received ${email ?? 'nothing'} and ${password ? 'a password' : 'nothing'}`,
    );
  }
  return { email, password };
}

/** Signs in through the login screen and waits for the signed-in shell.
 *
 *  Example: `await signIn(page, BIA)` */
export async function signIn(page: Page, { email, password }: Credentials): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
}
