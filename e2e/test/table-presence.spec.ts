import { expect, test, type Locator, type Page } from '@playwright/test';
import { BIA } from './support/dev-players';
import { adminCredentials, signIn } from './support/sign-in';

// Above the 5 s grace period of a dropped connection, with room for the CI runner.
const GRACE_AND_MARGIN_MS = 10_000;

function presenceOf(page: Page, name: string): Locator {
  return page
    .getByRole('region', { name: 'Na mesa' })
    .getByRole('listitem')
    .filter({ hasText: name });
}

async function createTableAndReadCode(admin: Page, name: string): Promise<string> {
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

async function joinByCodeAndEnter(player: Page, code: string): Promise<void> {
  await player.getByRole('button', { name: 'Entrar com código' }).first().click();
  const join = player.getByRole('dialog', { name: 'Entrar numa mesa' });
  await join.getByLabel('Código da mesa').fill(code);
  await join.getByRole('button', { name: 'Entrar', exact: true }).click();
  await player.getByRole('button', { name: 'Entrar na mesa' }).click();
  await expect(player.getByText('O tabuleiro abre aqui.')).toBeVisible();
}

async function enterFromTheList(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await page.getByRole('dialog', { name }).getByRole('button', { name: 'Entrar na mesa' }).click();
  await expect(page.getByText('O tabuleiro abre aqui.')).toBeVisible();
}

test('two people at the same table see each other online, and a closed page goes offline', async ({
  browser,
}) => {
  const name = `Mesa ao vivo ${Date.now()}`;
  const admin = await (await browser.newContext()).newPage();
  const bia = await (await browser.newContext()).newPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);

  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code);
  await enterFromTheList(admin, name);

  await expect(presenceOf(admin, 'Bia')).toContainText(/online$/);
  await expect(presenceOf(bia, 'Admin')).toContainText(/online$/);

  await bia.close();
  await expect(presenceOf(admin, 'Bia')).toContainText(/offline$/, {
    timeout: GRACE_AND_MARGIN_MS,
  });
});
