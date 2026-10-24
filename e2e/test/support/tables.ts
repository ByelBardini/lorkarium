import { expect, type Locator, type Page } from '@playwright/test';

// Above the 5 s grace period of a dropped connection, with room for the CI runner.
export const GRACE_AND_MARGIN_MS = 10_000;

/** The board of the play room on screen, named after its scene ("Tabuleiro: Cena 1, 20 × 12 casas").
 *
 *  Example: `await expect(boardOf(bia)).toHaveAccessibleName(/30 × 20 casas/)` */
export function boardOf(page: Page): Locator {
  return page.getByRole('application', { name: /^Tabuleiro/ });
}

/** Waits for the room's board, then opens the "Na mesa" tab, where the presence is.
 *
 *  Example: `await openRoomPeople(admin); await expect(presenceOf(admin, 'Bia')).toHaveAccessibleName('online')` */
export async function openRoomPeople(page: Page): Promise<void> {
  await expect(boardOf(page)).toBeVisible();
  await page.getByRole('tab', { name: 'Na mesa' }).click();
}

/** The presence symbol of `name` in the "Na mesa" tab of the room on screen (open it with
 *  `openRoomPeople`), named "online", "ausente" or "offline": on the portrait or avatar of the
 *  card or master row whose nick line names them (before the nick only while the board loads).
 *
 *  Example: `await expect(presenceOf(admin, 'Bia')).toHaveAccessibleName('online')` */
export function presenceOf(page: Page, name: string): Locator {
  const nickLine = page.getByTestId('nick-line').filter({ hasText: name });
  return page
    .getByRole('region', { name: 'Na mesa' })
    .locator('article, li')
    .filter({ has: nickLine })
    .getByRole('img', { name: /^(online|ausente|offline)$/ });
}

/** Creates a table from the home by "Nova mesa" and returns its code, back on the home.
 *
 *  Example: `const code = await createTableAndReadCode(admin, 'Mesa ao vivo 1')` */
export async function createTableAndReadCode(admin: Page, name: string): Promise<string> {
  await admin.getByRole('button', { name: 'Nova mesa' }).first().click();
  const create = admin.getByRole('dialog', { name: 'Nova mesa' });
  await create.getByLabel('Nome da mesa').fill(name);
  await create.getByRole('button', { name: 'Criar mesa' }).click();
  const created = admin.getByRole('dialog', { name: 'Mesa criada' });
  const code = created.getByText(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  await expect(code).toBeVisible();
  const text = await code.textContent();
  await created.getByRole('button', { name: 'Fechar' }).click();
  if (!text) throw new Error(`the "Mesa criada" step of ${name} showed no code`);
  return text;
}

/** From the home: joins a table by its code, has `master` promote the newcomer to player through
 *  the route (whoever enters by the code only watches) and only then opens it on the "Na mesa"
 *  tab, so the room opens as a player's.
 *
 *  Example: `await joinByCodeAndEnter(bia, code, admin)` */
export async function joinByCodeAndEnter(player: Page, code: string, master: Page): Promise<void> {
  const campaignId = await joinByCode(player, code);
  await promoteToPlayer(master, campaignId, await ownUserIdOf(player));
  await enterFromTheDetail(player);
}

/** From the home: joins a table by its code and opens it on the "Na mesa" tab as the spectator
 *  the code makes of a newcomer (nobody promotes).
 *
 *  Example: `await joinAsSpectatorAndEnter(caio, code)` */
export async function joinAsSpectatorAndEnter(spectator: Page, code: string): Promise<void> {
  await joinByCode(spectator, code);
  await enterFromTheDetail(spectator);
}

/** The "Espectadores · N" section of the "Na mesa" tab on screen (only there while someone
 *  watches).
 *
 *  Example: `await expect(spectatorsOf(admin)).toHaveAccessibleName('Espectadores · 1')` */
export function spectatorsOf(page: Page): Locator {
  return page
    .getByRole('region', { name: 'Na mesa' })
    .getByRole('region', { name: /^Espectadores · \d+$/ });
}

// The "Entrar numa mesa" dialog of the home; answers the id of the table, from the detail's URL.
async function joinByCode(page: Page, code: string): Promise<string> {
  await page.getByRole('button', { name: 'Entrar com código' }).first().click();
  const join = page.getByRole('dialog', { name: 'Entrar numa mesa' });
  await join.getByLabel('Código da mesa').fill(code);
  await join.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(CAMPAIGN_DETAIL_PATH);
  const campaignId = CAMPAIGN_DETAIL_PATH.exec(new URL(page.url()).pathname)?.[1];
  if (!campaignId) throw new Error(`expected /campaigns/<id> after joining, at ${page.url()}`);
  return campaignId;
}

const CAMPAIGN_DETAIL_PATH = /\/campaigns\/([0-9a-f-]{36})$/;

async function enterFromTheDetail(page: Page): Promise<void> {
  // Inside the detail dialog: the "Continuar" band behind it has an "Entrar na mesa" too.
  await page.getByRole('dialog').getByRole('button', { name: 'Entrar na mesa' }).click();
  await openRoomPeople(page);
}

async function ownUserIdOf(page: Page): Promise<string> {
  const response = await page.request.get('/api/auth/me');
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  const user = typeof body === 'object' && body !== null ? Reflect.get(body, 'user') : null;
  const id: unknown = user ? Reflect.get(user, 'id') : null;
  if (typeof id !== 'string') {
    throw new Error(
      `GET /api/auth/me: expected { user: { id } }, received ${JSON.stringify(body)}`,
    );
  }
  return id;
}

async function promoteToPlayer(master: Page, campaignId: string, userId: string): Promise<void> {
  const response = await master.request.patch(`/api/campaigns/${campaignId}/members/${userId}`, {
    data: { role: 'player' },
  });
  expect(response.status(), `promotion of ${userId} in ${campaignId}`).toBe(200);
}

/** From the home: opens a table the person is already in, through its row and detail, on the
 *  "Na mesa" tab.
 *
 *  Example: `await enterFromTheList(admin, 'Mesa ao vivo 1')` */
export async function enterFromTheList(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await page.getByRole('dialog', { name }).getByRole('button', { name: 'Entrar na mesa' }).click();
  await openRoomPeople(page);
}
