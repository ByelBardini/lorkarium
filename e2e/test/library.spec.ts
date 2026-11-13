import { expect } from '@playwright/test';
import { test } from './support/player-pages';
import { BIA } from './support/dev-players';
import {
  closeLibrary,
  createBlankGrid,
  createFolder,
  createGrid,
  expectTabsOf,
  gridItemOf,
  gridNoticeOf,
  gridTabsOf,
  libraryOf,
  nameNewGrid,
  openLibrary,
  pickGrid,
  setGridVisibility,
  takeTheGroupTo,
  treeOf,
} from './support/library';
import { adminCredentials, signIn } from './support/sign-in';
import {
  boardOf,
  createTableAndReadCode,
  enterFromTheList,
  joinByCodeAndEnter,
  openRoomPeople,
} from './support/tables';
import { cardOf, createTokenFor, openCard, statusOf } from './support/token-cards';

test('the library between master and player: a private grid stays hidden, a public one opens in a tab, the group is taken away and an F5 keeps the tabs', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const name = `Mesa biblioteca ${Date.now()}`;
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code, admin);
  await enterFromTheList(admin, name);

  // Ana prepares the Torre, with Bia's Lyra on it; a new grid is born private. Opening it in a
  // tab leaves the library open beside the board.
  const library = await openLibrary(admin);
  await createFolder(library, 'Ato 1');
  await createFolder(library, 'Norte', 'Ato 1');
  await createGrid(library, 'Torre');
  await expect(gridItemOf(library, 'Torre')).toHaveAccessibleDescription(/^Grid · Privado/);
  await library.getByRole('button', { name: 'Abrir pra preparar' }).click();
  await expect(gridTabsOf(admin).getByRole('tab', { name: 'Torre' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(boardOf(admin)).toHaveAccessibleName(/^Tabuleiro: Torre/);
  await expect(library).toBeVisible();
  await closeLibrary(admin);
  await createTokenFor(admin, 'Lyra', 'Bia');

  // Bia's library only has the group grid.
  const biaLibrary = await openLibrary(bia);
  await expect(gridItemOf(biaLibrary, 'Cena 1')).toBeVisible();
  await expect(gridItemOf(biaLibrary, 'Torre')).toHaveCount(0);

  // Ana publishes it: Bia's open library reloads by `library:changed` and she opens the Torre.
  const adminLibrary = await openLibrary(admin);
  await setGridVisibility(adminLibrary, 'Torre', 'Público');
  await pickGrid(biaLibrary, 'Torre');
  await biaLibrary.getByRole('button', { name: 'Abrir', exact: true }).click();
  await expect(boardOf(bia)).toHaveAccessibleName(/^Tabuleiro: Torre/);
  await closeLibrary(bia);

  // Bia moves Lyra there and Ana, on the same grid, sees it.
  await openCard(bia, 'Lyra');
  await boardOf(bia).focus();
  await bia.keyboard.press(']');
  await expect(statusOf(bia)).toContainText('Lyra selecionado, coluna 11, linha 7');
  await bia.keyboard.press('ArrowRight');
  await expect(statusOf(bia)).toContainText('Lyra foi para a coluna 12, linha 7');
  await closeLibrary(admin);
  await openCard(admin, 'Lyra');
  await expect(cardOf(admin, 'Lyra')).toContainText('Coluna 12, linha 7');

  // Ana makes it private again: Bia's tab closes with the notice.
  await setGridVisibility(await openLibrary(admin), 'Torre', 'Privado');
  await expect(gridNoticeOf(bia)).toHaveText('Torre ficou privada.');
  await expect(gridTabsOf(bia).getByRole('tab')).toHaveCount(1);
  await expect(boardOf(bia)).toHaveAccessibleName(/^Tabuleiro: Cena 1/);

  // Ana creates the Estrada at the root by the tree's menu and takes the group there: Bia's
  // group tab becomes the Estrada.
  const estradaLibrary = libraryOf(admin);
  // The empty space under the tree gives the menu of the root (there is no "Sem pasta" row).
  const treeArea = treeOf(estradaLibrary).locator('..');
  const area = await treeArea.boundingBox();
  if (!area) throw new Error('the tree area of the library has no box');
  await treeArea.click({ button: 'right', position: { x: 40, y: area.height - 12 } });
  await admin.getByRole('menuitem', { name: 'Criar novo item', exact: true }).click();
  await createBlankGrid(admin);
  await nameNewGrid(estradaLibrary, 'Estrada');
  await takeTheGroupTo(estradaLibrary, 'Estrada');
  await expect(gridNoticeOf(bia)).toHaveText('O mestre levou o grupo para Estrada.');
  await expect(gridTabsOf(bia).getByRole('tab')).toHaveText([/^Estrada\s*Grupo$/i]);
  await expect(boardOf(bia)).toHaveAccessibleName(/^Tabuleiro: Estrada/);
  await closeLibrary(admin);
  await expectTabsOf(admin, [/^Estrada/, 'Torre'], []);

  // An F5 keeps the tabs of each one.
  await admin.reload();
  await openRoomPeople(admin);
  await expectTabsOf(admin, [/^Estrada/, 'Torre'], []);
  await bia.reload();
  await openRoomPeople(bia);
  await expect(gridTabsOf(bia).getByRole('tab')).toHaveText([/^Estrada/]);
  await expect(boardOf(bia)).toHaveAccessibleName(/^Tabuleiro: Estrada/);
});
