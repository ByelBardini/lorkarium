import { expect, type Locator, type Page } from '@playwright/test';
import { test } from './support/player-pages';
import { cellCenterOf } from './support/board-cells';
import { BIA } from './support/dev-players';
import { createGrid, gridItemOf, openLibrary, takeTheGroupTo } from './support/library';
import { adminCredentials, signIn } from './support/sign-in';
import {
  boardOf,
  createTableAndReadCode,
  enterFromTheList,
  joinByCodeAndEnter,
  openRoomPeople,
} from './support/tables';
import { cardOf, createTokenWithPvFor, openCard } from './support/token-cards';

// "Ligar à ficha de… → Bia" from the menu of Lyra, born on the center cell (10, 6).
async function linkLyraToBiasCard(admin: Page): Promise<void> {
  const lyra = await cellCenterOf(admin, 10, 6);
  await admin.mouse.click(lyra.x, lyra.y, { button: 'right' });
  const menu = admin.getByRole('menu', { name: 'Ações de Lyra' });
  await menu.getByRole('menuitem', { name: 'Ligar à ficha de…' }).click();
  await admin.getByRole('menuitem', { name: 'Bia', exact: true }).click();
  await expect(menu).toBeHidden();
}

async function openLyraDialog(admin: Page): Promise<Locator> {
  await openCard(admin, 'Lyra');
  await cardOf(admin, 'Lyra').getByRole('button', { name: 'Editar token' }).click();
  return admin.getByRole('dialog', { name: 'Editar token' });
}

// "Editar token" → "Visão e luz" → "Emite luz": a torch on this grid's Lyra only.
async function lightLyraHere(admin: Page): Promise<void> {
  const dialog = await openLyraDialog(admin);
  await expect(dialog).toContainText('Na ficha de Bia · vale em todo grid');
  await dialog.getByRole('tab', { name: 'Visão e luz' }).click();
  await dialog.getByRole('switch', { name: 'Emite luz' }).click();
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toBeHidden();
}

async function poisonLyra(admin: Page): Promise<void> {
  await openCard(admin, 'Lyra');
  const dock = cardOf(admin, 'Lyra');
  await dock.getByRole('combobox', { name: 'Adicionar condição' }).fill('Envenenado');
  await dock.getByLabel('Rodadas').fill('3');
  await dock.getByRole('button', { name: 'Aplicar' }).click();
  await expect(dock.getByRole('list', { name: 'Condições ativas de Lyra' })).toContainText(
    'Envenenado',
  );
}

// Bia takes 7 PV off her own Lyra through the balloon of the dock.
async function hurtLyra(bia: Page): Promise<void> {
  await openCard(bia, 'Lyra');
  await cardOf(bia, 'Lyra').getByRole('button', { name: 'Editar PV de Lyra' }).dblclick();
  const current = bia.getByRole('dialog', { name: 'PV' }).getByRole('textbox', { name: 'Atual' });
  await current.fill('−7');
  await current.press('Enter');
  await expect(cardOf(bia, 'Lyra')).toContainText('3 / 10');
}

async function expectHurtAndPoisoned(page: Page): Promise<void> {
  await openCard(page, 'Lyra');
  await expect(cardOf(page, 'Lyra')).toContainText('3 / 10');
  await expect(
    cardOf(page, 'Lyra').getByRole('list', { name: 'Condições ativas de Lyra' }),
  ).toContainText('Envenenado');
}

test('the character crosses grids: linked to the card, added to the Estrada, with the PV and the condition of the Salão but not its light, kept on F5', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const name = `Mesa personagem ${Date.now()}`;
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code);
  await enterFromTheList(admin, name);

  // The group grid is the Salão: Ana renames it and puts Bia's Lyra there, linked to her card.
  const library = await openLibrary(admin);
  await gridItemOf(library, 'Cena 1').click();
  const nameField = library.getByRole('region', { name: 'Grid escolhido' }).getByLabel('Nome');
  await nameField.fill('Salão');
  await nameField.press('Enter');
  await expect(gridItemOf(library, 'Salão')).toBeVisible();
  await library.getByRole('button', { name: 'Fechar biblioteca' }).click();
  await expect(boardOf(admin)).toHaveAccessibleName(/^Tabuleiro: Salão/);
  await createTokenWithPvFor(admin, 'Lyra', 'Bia');
  await linkLyraToBiasCard(admin);
  await lightLyraHere(admin);
  await poisonLyra(admin);

  // Ana prepares the Estrada in a tab and adds the players: Bia's Lyra lands there, linked.
  const estradaLibrary = await openLibrary(admin);
  await createGrid(estradaLibrary, 'Estrada');
  await estradaLibrary.getByRole('button', { name: 'Abrir pra preparar' }).click();
  await expect(boardOf(admin)).toHaveAccessibleName(/^Tabuleiro: Estrada/);
  await admin.getByRole('button', { name: 'Adicionar jogadores' }).click();
  await openCard(admin, 'Lyra');

  // Bia, still in the Salão, takes 7 PV: the Lyra of the Estrada shares them at once.
  await hurtLyra(bia);
  await expectHurtAndPoisoned(admin);

  // Ana takes the group to the Estrada: Bia's Lyra there has the PV and the condition.
  await takeTheGroupTo(await openLibrary(admin), 'Estrada');
  await admin
    .getByRole('dialog', { name: 'Biblioteca de grids' })
    .getByRole('button', {
      name: 'Fechar biblioteca',
    })
    .click();
  await expect(boardOf(bia)).toHaveAccessibleName(/^Tabuleiro: Estrada/);
  await expectHurtAndPoisoned(bia);

  // The torch lit in the Salão is not lit in the Estrada: light stays with each grid's token.
  const dialog = await openLyraDialog(admin);
  await dialog.getByRole('tab', { name: 'Visão e luz' }).click();
  await expect(dialog.getByRole('switch', { name: 'Emite luz' })).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();

  await bia.reload();
  await openRoomPeople(bia);
  await expect(boardOf(bia)).toHaveAccessibleName(/^Tabuleiro: Estrada/);
  await expectHurtAndPoisoned(bia);
});
