import { expect, type Page } from '@playwright/test';
import { cellCenterOf } from './support/board-cells';
import { BIA } from './support/dev-players';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import { createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './support/tables';
import { cardOf, createTokenFor, openCard } from './support/token-cards';

// "Editar token" → "Formas" → "Nova forma": the base copies Thoren as he is (1 × 1) and the new
// form, already open, becomes the 2 × 2 "Lobo atroz".
async function addWolfForm(admin: Page): Promise<void> {
  await openCard(admin, 'Thoren');
  await cardOf(admin, 'Thoren').getByRole('button', { name: 'Editar token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Editar token' });
  await dialog.getByRole('tab', { name: /^Formas/ }).click();
  await dialog.getByRole('button', { name: 'Nova forma' }).click();
  await dialog.getByLabel('Nome da forma').fill('Lobo atroz');
  await dialog.getByRole('button', { name: /Grande/ }).click();
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toBeHidden();
}

async function expectSize(page: Page, size: string): Promise<void> {
  await openCard(page, 'Thoren');
  await expect(cardOf(page, 'Thoren')).toContainText(`${size} casas`);
}

test('forms: the master adds a dire wolf form, Bia turns Thoren into it by the key and back by the menu', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const name = `Mesa formas ${Date.now()}`;
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code, admin);
  await enterFromTheList(admin, name);

  // Thoren of Bia lands at (10, 6), 1 × 1.
  await createTokenFor(admin, 'Thoren', 'Bia');
  await addWolfForm(admin);

  // Bia selects her Thoren on the board and presses 2: the second form, on both pages.
  const thoren = await cellCenterOf(bia, 10, 6);
  await bia.mouse.click(thoren.x, thoren.y);
  await bia.keyboard.press('2');
  await expectSize(bia, '2 × 2');
  await expectSize(admin, '2 × 2');

  // Back to the base ("Thoren", the copy made by "Nova forma") by "Trocar forma" on the menu.
  const wolf = await cellCenterOf(bia, 10, 6);
  await bia.mouse.click(wolf.x, wolf.y, { button: 'right' });
  const menu = bia.getByRole('menu', { name: 'Ações de Thoren' });
  await menu.getByRole('menuitem', { name: 'Trocar forma' }).click();
  await bia.getByRole('menuitemradio', { name: 'Thoren' }).click();
  await expectSize(bia, '1 × 1');
  await expectSize(admin, '1 × 1');
});
