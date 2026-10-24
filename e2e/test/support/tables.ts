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

/** From the home: joins a table by its code and opens it on the "Na mesa" tab.
 *
 *  Example: `await joinByCodeAndEnter(bia, code)` */
export async function joinByCodeAndEnter(player: Page, code: string): Promise<void> {
  await player.getByRole('button', { name: 'Entrar com código' }).first().click();
  const join = player.getByRole('dialog', { name: 'Entrar numa mesa' });
  await join.getByLabel('Código da mesa').fill(code);
  await join.getByRole('button', { name: 'Entrar', exact: true }).click();
  // Inside the detail dialog: the "Continuar" band behind it has an "Entrar na mesa" too.
  await player.getByRole('dialog').getByRole('button', { name: 'Entrar na mesa' }).click();
  await openRoomPeople(player);
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
