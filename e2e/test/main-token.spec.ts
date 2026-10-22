import { expect, type Locator, type Page } from '@playwright/test';
import { test } from './support/player-pages';
import { BIA } from './support/dev-players';
import { adminCredentials, signIn } from './support/sign-in';
import { createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './support/tables';
import { chooseController, createTokenFor, openCard } from './support/token-cards';

function mainDockOf(page: Page, name: string): Locator {
  return page
    .getByRole('region', { name: 'Token principal' })
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
}

async function createLyraWithPv(admin: Page): Promise<void> {
  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill('Lyra');
  await chooseController(dialog, 'Bia');
  await dialog.getByRole('tab', { name: /^Barras/ }).click();
  await dialog.getByRole('button', { name: 'Nova barra' }).click();
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
}

test('Bia sees the bars of her Lyra without selecting anything, and switches her main token', async ({
  newPlayerPage,
}) => {
  test.setTimeout(120_000);
  const name = `Mesa principal ${Date.now()}`;
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code);
  await enterFromTheList(admin, name);
  await createLyraWithPv(admin);
  await createTokenFor(admin, 'Kael', 'Bia');

  // With nothing selected, the foot of the "Combate" tab already shows her Lyra.
  await bia.getByRole('tab', { name: 'Combate' }).click();
  const lyraDock = mainDockOf(bia, 'Lyra');
  await expect(lyraDock).toContainText('Principal');
  await expect(lyraDock.getByRole('textbox', { name: 'PV de Lyra', exact: true })).toBeVisible();

  // Another token she sees takes the place; "Fechar ficha" brings Lyra back.
  await openCard(bia, 'Kael');
  await bia
    .getByRole('region', { name: 'Token selecionado' })
    .getByRole('button', { name: 'Fechar ficha' })
    .click();
  await expect(mainDockOf(bia, 'Lyra')).toBeVisible();

  // The wolf becomes her main token, and a reload keeps it.
  await createTokenFor(admin, 'Lobo', 'Bia');
  await openCard(bia, 'Lobo');
  await bia.getByRole('button', { name: 'Tornar Lobo meu principal' }).click();
  await expect(bia.getByRole('region', { name: 'Token selecionado' })).toContainText('Principal');
  await bia.reload();
  await bia.getByRole('tab', { name: 'Combate' }).click();
  await expect(mainDockOf(bia, 'Lobo')).toContainText('Principal');
});
