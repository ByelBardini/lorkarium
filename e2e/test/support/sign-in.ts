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

// The login allows 5 attempts a minute per IP and e-mail (or @), and every spec signs the admin in:
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

/** Sends e-mail and password through the login screen, with no saved cookie: a session of its
 *  own (the caller waits for the shell, or for the 2FA step).
 *
 *  Example: `await submitLogin(page, BIA); await expect(page.getByRole('form', { name: 'Verificação em duas etapas' })).toBeVisible()` */
export async function submitLogin(page: Page, { email, password }: Credentials): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('E-mail ou usuário').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  const throttled = await clickEnterAndReadThrottle(page);
  if (throttled === null) return;
  await page.waitForTimeout(throttled);
  await clickEnterAndReadThrottle(page);
}

// The login allows 5 attempts a minute per IP and e-mail, and a CI retry starts a new worker that
// signs the same player in again: past the limit, wait the Retry-After once, as a person would.
async function clickEnterAndReadThrottle(page: Page): Promise<number | null> {
  const answer = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/auth/login') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Entrar' }).click();
  const response = await answer;
  if (response.status() !== 429) return null;
  const seconds = Number(response.headers()['retry-after'] ?? '60');
  return (Number.isFinite(seconds) ? seconds : 60) * 1000 + 500;
}

/** A new session through the login screen, never the saved cookie, then the signed-in shell.
 *
 *  Example: `await signInThroughTheForm(other, CAIO)` */
export async function signInThroughTheForm(page: Page, credentials: Credentials): Promise<void> {
  await submitLogin(page, credentials);
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
}
