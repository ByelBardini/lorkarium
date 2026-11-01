import { randomUUID } from 'node:crypto';
import {
  expect,
  type Download,
  type FrameLocator,
  type Locator,
  type Page,
  type Response,
} from '@playwright/test';
import { cellCenterOf } from './board-cells';
import { gridItemOf, gridTabsOf, openLibrary } from './library';
import { boardOf } from './tables';

/** What the e2e needs of a new sheet, from the answer of `POST /api/campaigns/:c/sheets`: its id
 *  and confirmed name (the title of its tab, region and frame). */
export type LibrarySheet = Readonly<{ sheetId: string; name: string }>;

export type SheetSourceCode = Readonly<{ name: string; html: string; css: string; js: string }>;

/** The id of the table whose room or detail is on screen, from the URL.
 *
 *  Example: `const campaignId = campaignIdOf(admin)` */
export function campaignIdOf(page: Page): string {
  const id = /\/campaigns\/([0-9a-f-]{36})/.exec(new URL(page.url()).pathname)?.[1];
  if (!id) throw new Error(`expected /campaigns/<id>/… on screen, at ${page.url()}`);
  return id;
}

/** "Criar item" → "Novo modelo de ficha" in the library: the template is born with the starter
 *  code of the client (name, PV, "Força", "−5 PV", "Rolar ataque"); only its name is typed, so
 *  the e2e never types into CodeMirror. Saves, then closes the library.
 *
 *  Example: `await createStarterTemplate(admin, 'Ficha Tormenta')` */
export async function createStarterTemplate(master: Page, name: string): Promise<void> {
  const library = await openLibrary(master);
  await library.getByRole('button', { name: 'Criar item' }).click();
  await master.getByRole('menuitem', { name: 'Novo modelo de ficha' }).click();
  const editor = library.getByRole('region', { name: 'Editor do modelo' });
  const nameField = editor.getByRole('textbox', { name: 'Nome do modelo' });
  await expect(nameField).toHaveValue('Modelo sem nome');
  await nameField.fill(name);
  await editor.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(editor.getByText('Salvo.', { exact: true })).toBeVisible();
  await library.getByRole('button', { name: 'Fechar biblioteca' }).click();
  await expect(boardOf(master)).toBeVisible();
}

/** A template written straight through `POST /api/campaigns/:c/sheet-templates` with the
 *  master's cookie: for code the e2e would otherwise have to type into CodeMirror.
 *
 *  Example: `await createTemplateByApi(admin, campaignIdOf(admin), HOSTILE_SHEET)` */
export async function createTemplateByApi(
  master: Page,
  campaignId: string,
  source: SheetSourceCode,
): Promise<void> {
  const response = await master.request.post(`/api/campaigns/${campaignId}/sheet-templates`, {
    data: source,
  });
  expect(response.status(), `template ${source.name} in ${campaignId}`).toBe(201);
}

/** The tree menu of a template → "Exportar modelo": the `.lksheet` of the saved version.
 *
 *  Example: `const file = await exportSheetTemplate(library, 'Modelo exportado')` */
export async function exportSheetTemplate(library: Locator, template: string): Promise<Download> {
  const page = library.page();
  await gridItemOf(library, template).click({ button: 'right' });
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Exportar modelo' }).click();
  return download;
}

/** "Criar item" → "Importar modelo de ficha" with a file on disk; stops at the confirmation (or
 *  the refusal) so the spec decides what to check.
 *
 *  Example: `await importSheetTemplate(library, await download.path())` */
export async function importSheetTemplate(library: Locator, filePath: string): Promise<void> {
  const page = library.page();
  const chooser = page.waitForEvent('filechooser');
  await library.getByRole('button', { name: 'Criar item' }).click();
  await page.getByRole('menuitem', { name: 'Importar modelo de ficha' }).click();
  await (await chooser).setFiles(filePath);
}

/** The master's "Nova ficha ▸ <template>" on the token born at the center cell (10, 6): the
 *  sheet is named "<template> · <token>" (on a linked token it is the character's) and opens in a
 *  tab of the master's room, which this closes again (back to the board).
 *
 *  Example: `const { sheetId, name } = await newSheetOnToken(admin, 'Lyra', 'Ficha Tormenta')` */
export async function newSheetOnToken(
  master: Page,
  token: string,
  template: string,
): Promise<LibrarySheet> {
  const created = master.waitForResponse(isSheetCreation);
  const menu = await openTokenMenu(master, token);
  await menu.getByRole('menuitem', { name: 'Nova ficha', exact: true }).click();
  await master.getByRole('menuitem', { name: template, exact: true }).click();
  const sheet = await librarySheetOf(await created);
  await closeSheetTab(master, sheet.name);
  return sheet;
}

/** The master's "Fichas de <character> ▸ Nova ficha ▸ <template>" on the player's card of the
 *  "Na mesa" tab: the sheet is the character's ("<template> · <character>"; the first one becomes
 *  its main sheet) and opens in a tab of the master's room, which this closes again.
 *
 *  Example: `const { name } = await newSheetFromCard(admin, 'Lyra', 'Ficha Tormenta')` */
export async function newSheetFromCard(
  master: Page,
  character: string,
  template: string,
): Promise<LibrarySheet> {
  const created = master.waitForResponse(isSheetCreation);
  await master.getByRole('tab', { name: 'Na mesa' }).click();
  await sheetsMenuOf(master, character).click();
  await master.getByRole('menuitem', { name: 'Nova ficha', exact: true }).click();
  await master.getByRole('menuitem', { name: template, exact: true }).click();
  const sheet = await librarySheetOf(await created);
  await closeSheetTab(master, sheet.name);
  await expect(boardOf(master)).toBeVisible();
  return sheet;
}

/** The master's "Quem vê a ficha ▸" on the token at the center cell (a token with one sheet, so
 *  the item is flat).
 *
 *  Example: `await setSheetVisibility(admin, 'Lyra', 'A mesa toda (só leitura)')` */
export async function setSheetVisibility(
  master: Page,
  token: string,
  choice: 'Só quem controla' | 'A mesa toda (só leitura)',
): Promise<void> {
  const menu = await openTokenMenu(master, token);
  await menu.getByRole('menuitem', { name: 'Quem vê a ficha', exact: true }).click();
  await master.getByRole('menuitemradio', { name: choice, exact: true }).click();
  await expect(menu).toBeHidden();
}

/** The library's "Criar item" → "Nova ficha": the dialog's name, the first template and the
 *  `holderIndex`-th option of "Dono" (0 = "Ninguém (só mestres)"). The new sheet is picked
 *  ("Ficha escolhida"); the library stays open. Answers the sheet from the server.
 *
 *  Example: `const npc = await createSheetInLibrary(library, 'Diário de viagem')` */
export async function createSheetInLibrary(
  library: Locator,
  name: string,
  holderIndex = 0,
): Promise<LibrarySheet> {
  const page = library.page();
  const created = page.waitForResponse(isSheetCreation);
  await library.getByRole('button', { name: 'Criar item' }).click();
  await page.getByRole('menuitem', { name: 'Nova ficha', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova ficha', exact: true });
  await dialog.getByRole('textbox', { name: 'Nome da ficha' }).fill(name);
  await dialog.getByRole('combobox', { name: 'Dono' }).click();
  await page.getByRole('option').nth(holderIndex).click();
  await dialog.getByRole('button', { name: 'Criar ficha', exact: true }).click();
  await expect(dialog).toBeHidden();
  const sheet = await librarySheetOf(await created);
  await expect(library.getByRole('region', { name: 'Ficha escolhida' })).toContainText(name);
  return sheet;
}

/** The master's "Dar a ▸ <player>" on a sheet of the library tree; `player` is the start of the
 *  item ("Bia", which reads "Bia (Lyra)" once she has a character). Waits for the server's yes.
 *
 *  Example: `await giveLibrarySheetTo(library, 'Diário de viagem', 'Bia')` */
export async function giveLibrarySheetTo(
  library: Locator,
  sheet: string,
  player: string,
): Promise<void> {
  const page = library.page();
  const given = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      /\/api\/campaigns\/[^/]+\/sheets\/[^/]+$/.test(new URL(response.url()).pathname),
  );
  await gridItemOf(library, sheet).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Dar a', exact: true }).click();
  await page.getByRole('menuitem', { name: new RegExp(`^${player}( \\(.*\\))?$`) }).click();
  expect((await given).status(), `give ${sheet} to ${player}`).toBe(200);
}

/** The "Abrir ficha de <character>" button of the player's card on the "Na mesa" tab (the one
 *  sheet the reader may see), opening `sheet`; answers the content of the sandboxed frame.
 *
 *  Example: `const frame = await openSheetFromCard(bia, 'Lyra', 'Ficha Tormenta · Lyra')` */
export async function openSheetFromCard(
  page: Page,
  character: string,
  sheet: string,
): Promise<FrameLocator> {
  await page.getByRole('tab', { name: 'Na mesa' }).click();
  await sheetButtonOf(page, character).click();
  await expect(sheetRegionOf(page, sheet)).toBeVisible();
  return sheetFrameOf(page, sheet);
}

/** The card's "Fichas de <character>" menu (several sheets, or the master), picking `sheet`.
 *
 *  Example: `await openSheetFromCardMenu(bia, 'Bia', 'Diário de viagem')` */
export async function openSheetFromCardMenu(
  page: Page,
  character: string,
  sheet: string,
): Promise<FrameLocator> {
  await page.getByRole('tab', { name: 'Na mesa' }).click();
  await sheetsMenuOf(page, character).click();
  await page.getByRole('menuitem', { name: sheet, exact: true }).click();
  await expect(sheetRegionOf(page, sheet)).toBeVisible();
  return sheetFrameOf(page, sheet);
}

/** The card's "Abrir ficha de <character>" button (absent while the reader sees no sheet of the
 *  character, or several). */
export function sheetButtonOf(page: Page, character: string): Locator {
  return page
    .getByRole('region', { name: 'Na mesa' })
    .getByRole('button', { name: `Abrir ficha de ${character}`, exact: true });
}

/** The card's "Fichas de <character>" menu button (several sheets, or always for the master). */
export function sheetsMenuOf(page: Page, character: string): Locator {
  return page
    .getByRole('region', { name: 'Na mesa' })
    .getByRole('button', { name: `Fichas de ${character}`, exact: true });
}

/** The app's frame around the sheet ("Ficha · <sheet name>"): template name, author line,
 *  "Somente leitura". */
export function sheetRegionOf(page: Page, sheet: string): Locator {
  return page.getByRole('region', { name: `Ficha · ${sheet}`, exact: true });
}

/** The content of the sandboxed sheet frame, titled "Ficha · <sheet name>" by the room. */
export function sheetFrameOf(page: Page, sheet: string): FrameLocator {
  return page.frameLocator(`iframe[title="Ficha · ${sheet}"]`);
}

/** The room tab of `sheet` ("Ficha · <sheet name>"). */
export function sheetTabOf(page: Page, sheet: string): Locator {
  return gridTabsOf(page).getByRole('tab', { name: `Ficha · ${sheet}`, exact: true });
}

/** The status of a read of the sheet with the page's own cookie (200, or 404 for whoever may not
 *  see it), and the values when it answers.
 *
 *  Example: `expect((await readSheet(caio, campaignId, sheetId)).status).toBe(404)` */
export async function readSheet(
  page: Page,
  campaignId: string,
  sheetId: string,
): Promise<Readonly<{ status: number; values: unknown }>> {
  const response = await page.request.get(`/api/campaigns/${campaignId}/sheets/${sheetId}`);
  if (response.status() !== 200) return { status: response.status(), values: null };
  const sheet = fieldOf(await response.json(), 'sheet');
  return { status: 200, values: fieldOf(sheet, 'values') };
}

/** A values patch with the page's own cookie; answers the HTTP status (403 for a reader who may
 *  not edit).
 *
 *  Example: `expect(await patchSheetValues(caio, campaignId, sheetId, { forca: 1 })).toBe(403)` */
export async function patchSheetValues(
  page: Page,
  campaignId: string,
  sheetId: string,
  changes: Readonly<Record<string, unknown>>,
): Promise<number> {
  const response = await page.request.patch(
    `/api/campaigns/${campaignId}/sheets/${sheetId}/values`,
    { data: { actionId: randomUUID(), changes } },
  );
  return response.status();
}

async function openTokenMenu(master: Page, token: string): Promise<Locator> {
  const center = await cellCenterOf(master, 10, 6);
  await master.mouse.click(center.x, center.y, { button: 'right' });
  return master.getByRole('menu', { name: `Ações de ${token}` });
}

async function closeSheetTab(page: Page, sheet: string): Promise<void> {
  await expect(sheetTabOf(page, sheet)).toBeVisible();
  await gridTabsOf(page)
    .getByRole('button', { name: `Fechar Ficha · ${sheet}`, exact: true })
    .click();
  await expect(boardOf(page)).toBeVisible();
}

function isSheetCreation(response: Response): boolean {
  return (
    response.request().method() === 'POST' &&
    /\/api\/campaigns\/[^/]+\/sheets$/.test(new URL(response.url()).pathname)
  );
}

async function librarySheetOf(response: Response): Promise<LibrarySheet> {
  expect(response.status(), `POST ${response.url()}`).toBe(201);
  const sheet = fieldOf(await response.json(), 'sheet');
  const sheetId = fieldOf(sheet, 'id');
  const name = fieldOf(sheet, 'name');
  if (typeof sheetId !== 'string' || typeof name !== 'string') {
    throw new Error(`expected { sheet: { id, name } }, received ${JSON.stringify(sheet)}`);
  }
  return { sheetId, name };
}

function fieldOf(body: unknown, key: string): unknown {
  return typeof body === 'object' && body !== null ? Reflect.get(body, key) : undefined;
}
