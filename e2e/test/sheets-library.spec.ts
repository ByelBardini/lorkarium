import { expect, type Page } from '@playwright/test';
import { BIA } from './support/dev-players';
import { closeLibrary, gridItemOf, gridTabsOf, openLibrary } from './support/library';
import { test } from './support/player-pages';
import {
  campaignIdOf,
  createSheetInLibrary,
  createStarterTemplate,
  giveLibrarySheetTo,
  openSheetFromCard,
  openSheetFromCardMenu,
  readSheet,
  sheetButtonOf,
  sheetsMenuOf,
} from './support/sheets';
import { adminCredentials, signIn } from './support/sign-in';
import {
  boardOf,
  createTableAndReadCode,
  enterFromTheList,
  joinByCodeAndEnter,
  showRoomTab,
} from './support/tables';

type LibraryTable = Readonly<{ admin: Page; bia: Page; campaignId: string }>;

/** Ana's table with Bia as a player who has no token yet (her character, named "Bia", is only on
 *  the card); both in the room. */
async function openTableWithoutTokens(newPlayerPage: () => Promise<Page>): Promise<LibraryTable> {
  const name = `Mesa fichas biblioteca ${Date.now()}`;
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code, admin);
  await enterFromTheList(admin, name);
  return { admin, bia, campaignId: campaignIdOf(admin) };
}

// "Abrir modelo em aba" moves the library's editor to a room tab; "Fechar modelo" closes it.
async function expectTemplateOpensInTab(admin: Page, template: string): Promise<void> {
  const library = await openLibrary(admin);
  await gridItemOf(library, template).click();
  const editor = library.getByRole('region', { name: 'Editor do modelo' });
  await editor.getByRole('button', { name: 'Abrir modelo em aba' }).click();
  await closeLibrary(admin);
  const tab = gridTabsOf(admin).getByRole('tab', { name: `Modelo · ${template}`, exact: true });
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  const roomEditor = admin.getByRole('region', { name: 'Editor do modelo' });
  await expect(roomEditor.getByRole('textbox', { name: 'Nome do modelo' })).toHaveValue(template);
  await roomEditor.getByRole('button', { name: 'Fechar modelo' }).click();
  await expect(tab).toHaveCount(0);
  await expect(boardOf(admin)).toBeVisible();
}

test('Ana opens the template in a tab, gives a library sheet to Bia before she has a token, and a second one makes Bia pick', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const { admin, bia, campaignId } = await openTableWithoutTokens(newPlayerPage);
  await createStarterTemplate(admin, 'Ficha Tormenta');
  await expectTemplateOpensInTab(admin, 'Ficha Tormenta');

  // Nobody holds it: only the masters see it, Bia neither reads it nor finds it.
  const library = await openLibrary(admin);
  const diary = await createSheetInLibrary(library, 'Diário de viagem');
  await expect(library.getByRole('region', { name: 'Ficha escolhida' })).toContainText(
    'sem dono, só mestres',
  );
  expect((await readSheet(bia, campaignId, diary.sheetId)).status).toBe(404);
  await showRoomTab(bia, 'Na mesa');
  await expect(
    bia
      .getByRole('region', { name: /^Jogadores/ })
      .getByRole('article', { name: 'Bia', exact: true }),
  ).toBeVisible();
  await expect(sheetButtonOf(bia, 'Bia')).toHaveCount(0);
  const biaLibrary = await openLibrary(bia);
  await expect(gridItemOf(biaLibrary, diary.name)).toHaveCount(0);
  await closeLibrary(bia);

  // "Dar a ▸ Bia": the sheet goes to her character (its main sheet); her card opens it.
  await giveLibrarySheetTo(library, diary.name, 'Bia');
  await expect(library.getByRole('region', { name: 'Ficha escolhida' })).toContainText(
    'Ficha · de Bia',
  );
  const sheet = await openSheetFromCard(bia, 'Bia', diary.name);
  await expect(sheet.locator('#pv')).toBeVisible();
  expect((await readSheet(bia, campaignId, diary.sheetId)).status).toBe(200);

  // A second sheet for Bia (by "Dono" in the dialog): the card's one icon becomes the menu, which
  // lists both, and she opens the second through it.
  const spells = await createSheetInLibrary(library, 'Caderno de magias', 1);
  await closeLibrary(admin);
  await expect(boardOf(admin)).toBeVisible();
  await bia.getByRole('tab', { name: /^Cena 1/ }).click();
  await showRoomTab(bia, 'Na mesa');
  await expect(sheetButtonOf(bia, 'Bia')).toHaveCount(0);
  await sheetsMenuOf(bia, 'Bia').click();
  const menu = bia.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: new RegExp(`^${diary.name}`) })).toContainText(
    'principal',
  );
  await expect(menu.getByRole('menuitem', { name: spells.name, exact: true })).toBeVisible();
  await bia.keyboard.press('Escape');
  await openSheetFromCardMenu(bia, 'Bia', spells.name);
});
