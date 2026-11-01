import { expect, type Locator, type Page } from '@playwright/test';
import { test } from './support/player-pages';
import { BIA, CAIO } from './support/dev-players';
import { createGrid, gridItemOf, openLibrary } from './support/library';
import { createStarterTemplate, newSheetFromCard, openSheetFromCard } from './support/sheets';
import { adminCredentials, signIn } from './support/sign-in';
import {
  boardOf,
  createTableAndReadCode,
  enterFromTheList,
  joinAsSpectatorAndEnter,
  openRoomPeople,
  spectatorsOf,
} from './support/tables';
import { cardOf, createCharacterTokenWithPv, openCard, statusOf } from './support/token-cards';

function playerCardOf(page: Page, character: string): Locator {
  return page
    .getByRole('region', { name: /^Jogadores/ })
    .getByRole('article', { name: character, exact: true });
}

async function chooseRoleAction(page: Page, person: string, item: string): Promise<void> {
  await page.getByRole('button', { name: `Mais ações de ${person}` }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

async function promoteBia(admin: Page, bia: Page): Promise<void> {
  await openRoomPeople(admin);
  await spectatorsOf(admin).getByRole('button', { name: 'Promover Bia a jogador' }).click();
  await expect(statusOf(bia)).toContainText('Agora você é jogador nesta mesa.');
}

// Ana renames the group grid ("Cena 1") to Salão.
async function nameTheSalao(admin: Page): Promise<void> {
  const library = await openLibrary(admin);
  await gridItemOf(library, 'Cena 1').click();
  const nameField = library.getByRole('region', { name: 'Grid escolhido' }).getByLabel('Nome');
  await nameField.fill('Salão');
  await nameField.press('Enter');
  await expect(gridItemOf(library, 'Salão')).toBeVisible();
  await library.getByRole('button', { name: 'Fechar biblioteca' }).click();
  await expect(boardOf(admin)).toHaveAccessibleName(/^Tabuleiro: Salão/);
}

// Caio, a co-master, opens the Estrada (prepared by Ana, with the players added) in a tab.
async function caioOpensTheEstrada(admin: Page, caio: Page): Promise<void> {
  await openRoomPeople(admin);
  await chooseRoleAction(admin, 'Caio', 'Tornar mestre');
  const confirm = admin.getByRole('alertdialog', { name: 'Tornar Caio mestre?' });
  await confirm.getByRole('button', { name: 'Tornar mestre' }).click();
  await expect(statusOf(caio)).toContainText('Agora você é mestre desta mesa.');
  const library = await openLibrary(admin);
  await createGrid(library, 'Estrada');
  await library.getByRole('button', { name: 'Abrir pra preparar' }).click();
  await expect(boardOf(admin)).toHaveAccessibleName(/^Tabuleiro: Estrada/);
  await admin.getByRole('button', { name: 'Adicionar jogadores' }).click();
  await openCard(admin, 'Lyra');
  const caioLibrary = await openLibrary(caio);
  await gridItemOf(caioLibrary, 'Estrada').click();
  await caioLibrary.getByRole('button', { name: 'Abrir pra preparar' }).click();
  await expect(boardOf(caio)).toHaveAccessibleName(/^Tabuleiro: Estrada/);
}

// Bia, in the Salão, takes 7 PV off her Lyra through the balloon of the dock.
async function hurtLyra(bia: Page): Promise<void> {
  await expect(boardOf(bia)).toHaveAccessibleName(/^Tabuleiro: Salão/);
  await openCard(bia, 'Lyra');
  await cardOf(bia, 'Lyra').getByRole('button', { name: 'Editar PV de Lyra' }).dblclick();
  const current = bia.getByRole('dialog', { name: 'PV' }).getByRole('textbox', { name: 'Atual' });
  await current.fill('−7');
  await current.press('Enter');
  await expect(cardOf(bia, 'Lyra')).toContainText('3 / 10');
}

async function writeArmorClass(bia: Page): Promise<void> {
  await bia.getByRole('tab', { name: 'Na mesa' }).click();
  const armor = playerCardOf(bia, 'Lyra').getByRole('textbox', { name: 'CA de Lyra' });
  await armor.fill('15');
  await armor.press('Enter');
  await expect(playerCardOf(bia, 'Lyra').getByRole('textbox', { name: 'CA de Lyra' })).toHaveValue(
    '15',
  );
}

async function demoteBia(admin: Page, bia: Page): Promise<void> {
  await openRoomPeople(admin);
  await chooseRoleAction(admin, 'Bia', 'Mover para espectadores');
  const confirm = admin.getByRole('alertdialog', { name: 'Mover Bia para espectadores?' });
  await confirm.getByRole('button', { name: 'Mover', exact: true }).click();
  await expect(statusOf(bia)).toContainText('Agora você assiste a esta mesa.');
  await expect(playerCardOf(admin, 'Lyra')).toHaveCount(0);
  await expect(spectatorsOf(admin)).toContainText('Bia');
}

test("the character: Bia's card on promotion, a token linked to it, PV across grids, its main sheet, and its CA kept through demote and promote", async ({
  newPlayerPage,
}) => {
  // Three pages drawing PixiJS without a GPU, like co-masters.spec.
  test.setTimeout(240_000);
  const name = `Mesa personagens ${Date.now()}`;
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  const caio = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await signIn(bia, BIA);
  await joinAsSpectatorAndEnter(bia, code);
  await signIn(caio, CAIO);
  await joinAsSpectatorAndEnter(caio, code);
  await enterFromTheList(admin, name);

  // Promoted, Bia gets her character: a card named after her nick, for her and for Ana.
  await promoteBia(admin, bia);
  await expect(playerCardOf(admin, 'Bia')).toBeVisible();
  await openRoomPeople(bia);
  await expect(playerCardOf(bia, 'Bia')).toBeVisible();

  // Ana links a token of the Salão to it, names it Lyra and gives it PV: the card follows.
  await nameTheSalao(admin);
  await createCharacterTokenWithPv(admin, 'Lyra', 'Bia');
  await openRoomPeople(bia);
  await expect(playerCardOf(bia, 'Lyra').getByRole('meter', { name: 'PV de Lyra' })).toHaveText(
    '10 / 10',
  );

  // Bia takes 7 PV in the Salão; Caio, a co-master on the Estrada, sees them on his Lyra.
  await caioOpensTheEstrada(admin, caio);
  await hurtLyra(bia);
  await openCard(caio, 'Lyra');
  await expect(cardOf(caio, 'Lyra')).toContainText('3 / 10');

  // A sheet given to her character is its main sheet: one click on her card opens it.
  await createStarterTemplate(admin, 'Ficha Tormenta');
  const { name: sheetName } = await newSheetFromCard(admin, 'Lyra', 'Ficha Tormenta');
  expect(sheetName).toBe('Ficha Tormenta · Lyra');
  const sheet = await openSheetFromCard(bia, 'Lyra', sheetName);
  await expect(sheet.getByRole('heading', { name: 'Lyra' })).toBeVisible();
  await expect(sheet.locator('#pv')).toHaveText('3 / 10');

  // Demoted, the card goes; promoted again, the same character comes back with its CA.
  await bia.getByRole('tab', { name: /^Salão/ }).click();
  await writeArmorClass(bia);
  await demoteBia(admin, bia);
  await promoteBia(admin, bia);
  await expect(
    playerCardOf(admin, 'Lyra').getByRole('textbox', { name: 'CA de Lyra' }),
  ).toHaveValue('15');
});
