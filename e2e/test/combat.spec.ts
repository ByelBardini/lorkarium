import { expect, test, type Locator, type Page } from '@playwright/test';
import { BIA, CAIO } from './support/dev-players';
import { adminCredentials, signIn } from './support/sign-in';
import { createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './support/tables';

function order(page: Page): Locator {
  return page.getByRole('list', { name: 'Ordem de iniciativa' }).getByRole('listitem');
}

function turnLine(page: Page): Locator {
  return page.getByRole('region', { name: 'Topo da sala' }).getByLabel('Rodada e vez');
}

async function showCombat(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Combate' }).click();
}

async function createToken(admin: Page, name: string, controller: string | null): Promise<void> {
  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill(name);
  if (controller) await dialog.getByRole('checkbox', { name: controller }).click();
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
}

async function setInitiative(page: Page, name: string, value: string): Promise<void> {
  const field = page.getByLabel(`Iniciativa de ${name}`);
  await field.fill(value);
  await field.press('Enter');
}

test('a whole combat: order, turns, rounds, a condition that expires, passing the turn, a tie and an F5', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const name = `Mesa combate ${Date.now()}`;
  const admin = await (await browser.newContext()).newPage();
  const bia = await (await browser.newContext()).newPage();
  const caio = await (await browser.newContext()).newPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  for (const [page, who] of [
    [bia, BIA],
    [caio, CAIO],
  ] as const) {
    await signIn(page, who);
    await joinByCodeAndEnter(page, code);
    await showCombat(page);
  }
  await enterFromTheList(admin, name);
  await showCombat(admin);

  await createToken(admin, 'Kael', 'Bia');
  await createToken(admin, 'Lyra', 'Caio');
  await createToken(admin, 'Goblin', null);
  await admin.getByRole('button', { name: 'Iniciar combate' }).click();
  await admin
    .getByRole('dialog', { name: 'Iniciar combate' })
    .getByRole('button', { name: 'Iniciar' })
    .click();

  await setInitiative(admin, 'Kael', '18');
  await setInitiative(admin, 'Lyra', '14');
  await setInitiative(admin, 'Goblin', '-2');
  for (const page of [admin, bia, caio]) {
    await expect(order(page)).toHaveText([/Kael/, /Lyra/, /Goblin/]);
  }

  await order(admin).filter({ hasText: 'Lyra' }).getByRole('button', { name: 'Lyra' }).click();
  await admin.getByLabel('Adicionar condição').selectOption('Atordoado');
  await admin.getByLabel('Rodadas').fill('1');
  await admin.getByRole('button', { name: 'Aplicar' }).click();
  await expect(order(caio).filter({ hasText: 'Lyra' })).toContainText('Atordoado');

  await expect(caio.getByRole('button', { name: 'Passar a vez' })).toHaveCount(0);
  await bia.getByRole('button', { name: 'Passar a vez' }).click();
  await expect(turnLine(caio)).toHaveText('Rodada 1 · Vez de Lyra');

  await caio.getByRole('button', { name: 'Passar a vez' }).click();
  for (const page of [admin, bia, caio]) {
    await expect(order(page).filter({ hasText: 'Lyra' })).not.toContainText('Atordoado');
  }

  await admin.getByRole('button', { name: 'Próximo turno' }).click();
  for (const page of [admin, bia, caio]) {
    await expect(turnLine(page)).toHaveText('Rodada 2 · Vez de Kael');
  }

  await setInitiative(caio, 'Lyra', '18');
  await admin.getByRole('button', { name: 'Subir Lyra no empate' }).click();
  await expect(order(bia)).toHaveText([/Lyra/, /Kael/, /Goblin/]);

  await bia.reload();
  await showCombat(bia);
  await expect(turnLine(bia)).toHaveText('Rodada 2 · Vez de Kael');
  await expect(order(bia)).toHaveText([/Lyra/, /Kael/, /Goblin/]);

  await admin.getByRole('button', { name: 'Encerrar combate' }).click();
  await admin.getByRole('button', { name: 'Encerrar', exact: true }).click();
  await expect(bia.getByText('Fora de combate')).toBeVisible();
});
