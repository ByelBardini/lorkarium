import { expect, type Page } from '@playwright/test';
import { Secret, TOTP } from 'otpauth';

// The server's TOTP (server/src/infrastructure/totp/otpauth-totp.ts): change both together.
const TOTP_PERIOD_SECONDS = 30;
// After the step turns, a margin for the two clocks (same machine) and the request on its way.
const STEP_MARGIN_MS = 500;

/** What a spec puts back on the account it borrowed: the nickname and the color choice. */
export type OwnProfile = Readonly<{ name: string; color: string; colorChoice: string | null }>;

/** The signed-in person's profile, by `GET /api/account/profile` with the page's cookie.
 *
 *  Example: `const before = await readOwnProfile(admin)` */
export async function readOwnProfile(page: Page): Promise<OwnProfile> {
  const response = await page.request.get('/api/account/profile');
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  const profile = typeof body === 'object' && body !== null ? Reflect.get(body, 'profile') : null;
  const name: unknown = profile ? Reflect.get(profile, 'name') : null;
  const color: unknown = profile ? Reflect.get(profile, 'color') : null;
  const colorChoice: unknown = profile ? Reflect.get(profile, 'colorChoice') : undefined;
  if (typeof name !== 'string' || typeof color !== 'string' || colorChoice === undefined) {
    throw new Error(
      `GET /api/account/profile: expected { profile: { name, color, colorChoice } }, received ${JSON.stringify(body)}`,
    );
  }
  return { name, color, colorChoice: typeof colorChoice === 'string' ? colorChoice : null };
}

/** Puts the nickname and the color choice back (`null` = the automatic color again), so the
 *  borrowed account leaves the spec as it came in.
 *
 *  Example: `await restoreOwnProfile(admin, before)` */
export async function restoreOwnProfile(page: Page, profile: OwnProfile): Promise<void> {
  const response = await page.request.patch('/api/account/profile', {
    data: { name: profile.name, color: profile.colorChoice },
  });
  expect(response.status()).toBe(200);
}

/** Opens "Minha conta" and waits for its heading.
 *
 *  Example: `await openAccount(caio); await caio.getByRole('button', { name: 'Trocar senha' }).click()` */
export async function openAccount(page: Page): Promise<void> {
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Minha conta', level: 1 })).toBeVisible();
}

/** "Sair" from the account menu of the rail (its button is named after the person), back at the
 *  login screen.
 *
 *  Example: `await signOutByMenu(bia, 'Bia')` */
export async function signOutByMenu(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** The authenticator app of the spec, from the key "Chave para digitar no app" shows (grouped by
 *  4 with spaces).
 *
 *  Example: `const app = authenticatorOf('JBSW Y3DP EHPK 3PXP'); app.generate()` */
export function authenticatorOf(shownKey: string): TOTP {
  return new TOTP({
    secret: Secret.fromBase32(shownKey.replace(/\s/g, '')),
    algorithm: 'SHA1',
    digits: 6,
    period: TOTP_PERIOD_SECONDS,
  });
}

/** The current TOTP step (RFC 6238), the one the server records as used.
 *
 *  Example: `const enabledAt = currentTotpStep()` */
export function currentTotpStep(): number {
  return TOTP.counter({ period: TOTP_PERIOD_SECONDS });
}

/** A code of a step after `usedStep`: the server refuses a step it already accepted (replay), so
 *  this waits for the next one when needed (at most one period).
 *
 *  Example: `const code = await codeAfterStep(bia, app, enabledAt)` */
export async function codeAfterStep(page: Page, app: TOTP, usedStep: number): Promise<string> {
  const nextStepAtMs = (usedStep + 1) * TOTP_PERIOD_SECONDS * 1000;
  const waitMs = nextStepAtMs - Date.now();
  if (waitMs > 0) await page.waitForTimeout(waitMs + STEP_MARGIN_MS);
  return app.generate();
}
