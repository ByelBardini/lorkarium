import { expect, type Locator, type Page } from '@playwright/test';

// Above the 5 s grace period of a dropped connection, with room for the CI runner.
export const GRACE_AND_MARGIN_MS = 10_000;

/** The row of `name` in the "Na mesa" panel of the table on screen.
 *
 *  Example: `await expect(presenceOf(admin, 'Bia')).toContainText(/online$/)` */
export function presenceOf(page: Page, name: string): Locator {
  return page
    .getByRole('region', { name: 'Na mesa' })
    .getByRole('listitem')
    .filter({ hasText: name });
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

/** From the home: joins a table by its code and opens it.
 *
 *  Example: `await joinByCodeAndEnter(bia, code)` */
export async function joinByCodeAndEnter(player: Page, code: string): Promise<void> {
  await player.getByRole('button', { name: 'Entrar com código' }).first().click();
  const join = player.getByRole('dialog', { name: 'Entrar numa mesa' });
  await join.getByLabel('Código da mesa').fill(code);
  await join.getByRole('button', { name: 'Entrar', exact: true }).click();
  // Inside the detail dialog: the "Continuar" band behind it has an "Entrar na mesa" too.
  await player.getByRole('dialog').getByRole('button', { name: 'Entrar na mesa' }).click();
  await expect(player.getByText('O tabuleiro abre aqui.')).toBeVisible();
}

/** From the home: opens a table the person is already in, through its row and detail.
 *
 *  Example: `await enterFromTheList(admin, 'Mesa ao vivo 1')` */
export async function enterFromTheList(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await page.getByRole('dialog', { name }).getByRole('button', { name: 'Entrar na mesa' }).click();
  await expect(page.getByText('O tabuleiro abre aqui.')).toBeVisible();
}
