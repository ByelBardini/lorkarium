import { expect, type BrowserContext, type Page } from '@playwright/test';

type SessionCookies = Awaited<ReturnType<BrowserContext['cookies']>>;

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

// The login allows 5 attempts a minute per IP and e-mail, and every spec signs the admin in:
// one real login per worker and e-mail, then the session cookie is reused.
const sessionsByEmail = new Map<string, SessionCookies>();

/** Signs in (through the login screen the first time, by the saved session cookie after that)
 *  and waits for the signed-in shell.
 *
 *  Example: `await signIn(page, BIA)` */
export async function signIn(page: Page, credentials: Credentials): Promise<void> {
  const saved = sessionsByEmail.get(credentials.email);
  if (saved) await page.context().addCookies(saved);
  else await signInThroughTheForm(page, credentials);
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
  sessionsByEmail.set(credentials.email, await page.context().cookies());
}

async function signInThroughTheForm(page: Page, { email, password }: Credentials): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
}
