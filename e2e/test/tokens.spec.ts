import { expect, type Page } from '@playwright/test';
import { test } from './support/player-pages';
import { dragBetweenCells } from './support/board-cells';
import { BIA, CAIO } from './support/dev-players';
import { adminCredentials, signIn } from './support/sign-in';
import { cardOf, openCard, statusOf, chooseController } from './support/token-cards';
import {
  boardOf,
  createTableAndReadCode,
  enterFromTheList,
  joinByCodeAndEnter,
} from './support/tables';

async function createLyraFor(admin: Page, player: string): Promise<void> {
  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill('Lyra');
  await chooseController(dialog, player);
  await dialog.getByRole('tab', { name: /^Barras/ }).click();
  await dialog.getByRole('button', { name: 'Nova barra' }).click();
  await dialog.getByRole('button', { name: 'Nova barra' }).click();
  const second = dialog.getByRole('listitem', { name: /^Barra 2/ });
  await second.getByLabel('Rótulo').fill('Inspiração');
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
}

test('tokens live: the hidden bar never reaches another player, only the controller moves, and an F5 keeps it all', async ({
  newPlayerPage,
}) => {
  test.setTimeout(90_000);
  const name = `Mesa tokens ${Date.now()}`;
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  const caio = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  for (const [page, who] of [
    [bia, BIA],
    [caio, CAIO],
  ] as const) {
    await signIn(page, who);
    await joinByCodeAndEnter(page, code);
  }
  await enterFromTheList(admin, name);

  await createLyraFor(admin, 'Bia');
  await openCard(bia, 'Lyra');
  await expect(cardOf(bia, 'Lyra')).toContainText('Coluna 11, linha 7');
  await expect(cardOf(bia, 'Lyra')).toContainText('PV');

  await boardOf(bia).focus();
  await bia.keyboard.press(']');
  await expect(statusOf(bia)).toContainText('Lyra selecionado, coluna 11, linha 7');
  await bia.keyboard.press('ArrowRight');
  await expect(statusOf(bia)).toContainText('Lyra foi para a coluna 12, linha 7');
  await openCard(admin, 'Lyra');
  await expect(cardOf(admin, 'Lyra')).toContainText('Coluna 12, linha 7');

  await openCard(caio, 'Lyra');
  await expect(cardOf(caio, 'Lyra')).toContainText('Inspiração');
  await expect(cardOf(caio, 'Lyra')).not.toContainText('PV');
  await boardOf(caio).focus();
  await caio.keyboard.press(']');
  await caio.keyboard.press('ArrowLeft');
  await expect(statusOf(caio)).toContainText('Esse token não é seu.');

  const pv = bia.getByRole('textbox', { name: 'PV de Lyra', exact: true });
  await pv.fill('−50');
  await pv.press('Enter');
  await expect(cardOf(admin, 'Lyra')).toContainText('−40 / 10');
  await bia.getByRole('button', { name: 'Mudar máximo de PV de Lyra' }).click();
  const pvMax = bia.getByRole('textbox', { name: 'Máximo de PV de Lyra' });
  await pvMax.fill('50');
  await pvMax.press('Enter');
  await expect(cardOf(admin, 'Lyra')).toContainText('−40 / 50');

  await dragBetweenCells(admin, [11, 6], [4, 4]);
  await expect(cardOf(admin, 'Lyra')).toContainText('Coluna 5, linha 5');

  await bia.reload();
  await openCard(bia, 'Lyra');
  await expect(cardOf(bia, 'Lyra')).toContainText('Coluna 5, linha 5');
  await expect(cardOf(bia, 'Lyra')).toContainText('−40 / 50');
});

test('the lean creation: a token with only the name, the controller and a PV of 45 reaches the table full, and an F5 keeps it', async ({
  newPlayerPage,
}) => {
  test.setTimeout(90_000);
  const name = `Mesa criação enxuta ${Date.now()}`;
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  const caio = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  for (const [page, who] of [
    [bia, BIA],
    [caio, CAIO],
  ] as const) {
    await signIn(page, who);
    await joinByCodeAndEnter(page, code);
  }
  await enterFromTheList(admin, name);

  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill('Ogro');
  await chooseController(dialog, 'Bia');
  await dialog.getByRole('tab', { name: /^Barras/ }).click();
  await dialog.getByRole('button', { name: '+ PV' }).click();
  await dialog.getByLabel('Máximo de PV').fill('45');
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();

  await openCard(bia, 'Ogro');
  await expect(cardOf(bia, 'Ogro')).toContainText('45 / 45');
  await expect(cardOf(bia, 'Ogro')).toContainText('1 × 1 casas');
  await openCard(caio, 'Ogro');
  await expect(cardOf(caio, 'Ogro')).toContainText('1 × 1 casas');
  await expect(cardOf(caio, 'Ogro')).not.toContainText('PV');

  await bia.reload();
  await openCard(bia, 'Ogro');
  await expect(cardOf(bia, 'Ogro')).toContainText('45 / 45');
});
