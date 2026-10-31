import { expect, type Locator, type Page } from '@playwright/test';
import { BIA, CAIO } from './support/dev-players';
import {
  changeDocument,
  createDocument,
  documentPanelOf,
  documentUrl,
  expandDocument,
  pastePortraitIntoDocument,
  readDocument,
  readTabContent,
  savedStatusOf,
  tabIdOf,
} from './support/documents';
import { openLibrary } from './support/library';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import { createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './support/tables';

function documentTabsOf(panel: Locator): Locator {
  return panel.getByRole('tablist', { name: 'Abas do documento', exact: true });
}
function documentTabOf(panel: Locator, name: string): Locator {
  return documentTabsOf(panel).getByRole('tab', { name, exact: true });
}
function bodyOf(panel: Locator): Locator {
  return panel.getByRole('textbox', { name: 'Conteúdo do documento', exact: true });
}
// "+" creates the tab, shows it and opens its name field focused; Enter saves the name.
async function createDocumentTab(panel: Locator, name: string): Promise<void> {
  await panel.getByRole('button', { name: 'Nova aba', exact: true }).click();
  const field = panel.getByRole('textbox', { name: 'Nome da aba', exact: true });
  await expect(field).toBeFocused();
  await field.fill(name);
  await field.press('Enter');
  await expect(documentTabOf(panel, name)).toHaveAttribute('aria-selected', 'true');
}
async function writeInTab(panel: Locator, name: string, text: string): Promise<void> {
  await documentTabOf(panel, name).click();
  await expect(documentTabOf(panel, name)).toHaveAttribute('aria-selected', 'true');
  await bodyOf(panel).fill(text);
  await expect(savedStatusOf(panel)).toBeVisible();
}
async function chooseTabAction(
  page: Page,
  panel: Locator,
  tab: string,
  action: string,
): Promise<void> {
  await panel.getByRole('button', { name: `Opções da aba ${tab}`, exact: true }).click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}
async function hideFromPlayers(page: Page, panel: Locator, tab: string): Promise<void> {
  await panel.getByRole('button', { name: `Opções da aba ${tab}`, exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Só mestres', exact: true }).click();
  await expect(documentTabOf(panel, tab).locator('[aria-label="Só mestres"]')).toHaveCount(1);
}
async function openTable(page: Page, table: string): Promise<Locator> {
  await signIn(page, adminCredentials());
  await createTableAndReadCode(page, table);
  await enterFromTheList(page, table);
  return openLibrary(page);
}

test('each document tab keeps its own text across a reload', async ({ newPlayerPage }) => {
  test.setTimeout(120_000);
  const master = await newPlayerPage();
  const library = await openTable(master, `Abas do documento ${Date.now()}`);
  const id = await createDocument(master, library, 'Diário da campanha');
  const panel = documentPanelOf(master);
  await createDocumentTab(panel, 'Itens');
  await writeInTab(panel, 'Itens', 'Espada longa e corda');
  await createDocumentTab(panel, 'Segredos');
  await writeInTab(panel, 'Segredos', 'O duque é o vilão');
  await expect(documentTabsOf(panel).getByRole('tab')).toHaveText(['Geral', 'Itens', 'Segredos']);
  await expect.poll(() => readTabContent(master, id, 'Itens')).toContain('Espada longa e corda');
  await expect.poll(() => readTabContent(master, id, 'Segredos')).toContain('O duque é o vilão');
  await master.reload();
  const reopened = await expandDocument(master, await openLibrary(master), 'Diário da campanha');
  await expect(documentTabsOf(reopened).getByRole('tab')).toHaveText([
    'Geral',
    'Itens',
    'Segredos',
  ]);
  await documentTabOf(reopened, 'Itens').click();
  await expect(bodyOf(reopened)).toHaveText('Espada longa e corda');
  await documentTabOf(reopened, 'Segredos').click();
  await expect(bodyOf(reopened)).toHaveText('O duque é o vilão');
  await documentTabOf(reopened, 'Geral').click();
  await expect(bodyOf(reopened)).not.toContainText('Espada longa');
});

test('a masters-only tab stays hidden with its image from the owner, keeps its place when she reorders, and a reader adds no tab', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const master = await newPlayerPage();
  const bia = await newPlayerPage();
  const caio = await newPlayerPage();
  await signIn(master, adminCredentials());
  const table = `Aba secreta ${Date.now()}`;
  const code = await createTableAndReadCode(master, table);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code, master);
  await signIn(caio, CAIO);
  await joinByCodeAndEnter(caio, code, master);
  await enterFromTheList(master, table);
  const id = await createDocument(master, await openLibrary(master), 'Crônicas');
  const panel = documentPanelOf(master);
  await createDocumentTab(panel, 'Segredos');
  await writeInTab(panel, 'Segredos', 'O duque é o vilão');
  await pastePortraitIntoDocument(master);
  await expect(bodyOf(panel).locator('img')).toHaveCount(1);
  await expect.poll(() => readTabContent(master, id, 'Segredos')).toContain('assetId');
  const assetId = /"assetId":"([0-9a-f-]{36})"/.exec(
    await readTabContent(master, id, 'Segredos'),
  )?.[1];
  if (!assetId) throw new Error('expected the pasted image saved in "Segredos"; no assetId');
  await hideFromPlayers(master, panel, 'Segredos');
  await createDocumentTab(panel, 'Itens');
  await writeInTab(panel, 'Itens', 'Espada longa e corda');
  await panel.getByRole('button', { name: 'Compartilhamento', exact: true }).click();
  await master.getByRole('checkbox', { name: 'Bia', exact: true }).check();
  await master.getByRole('button', { name: 'Salvar donos', exact: true }).click();
  const segredosId = await tabIdOf(master, id, 'Segredos');

  const biaPanel = await expandDocument(bia, await openLibrary(bia), 'Crônicas');
  await expect(documentTabsOf(biaPanel).getByRole('tab')).toHaveText(['Geral', 'Itens']);
  expect((await readDocument(bia, id)).tabs.map((tab) => tab.name)).toEqual(['Geral', 'Itens']);
  expect((await bia.request.get(`${documentUrl(master, id)}/tabs/${segredosId}`)).status()).toBe(
    404,
  );
  expect((await bia.request.get(`/api/assets/${assetId}`)).status()).toBe(404);
  expect((await master.request.get(`/api/assets/${assetId}`)).status()).toBe(200);
  await biaPanel.getByRole('button', { name: 'Opções da aba Itens', exact: true }).click();
  await expect(bia.getByRole('menuitem', { name: 'Renomear', exact: true })).toBeVisible();
  await expect(bia.getByRole('menuitemcheckbox', { name: 'Só mestres' })).toHaveCount(0);
  await bia.keyboard.press('Escape');
  await expect(bia.getByRole('menu')).toHaveCount(0);
  await chooseTabAction(bia, biaPanel, 'Itens', 'Mover para a esquerda');
  await expect(documentTabsOf(biaPanel).getByRole('tab')).toHaveText(['Itens', 'Geral']);
  await expect(documentTabsOf(panel).getByRole('tab')).toHaveText(['Itens', 'Segredos', 'Geral']);
  await expect(bia.getByText('O duque é o vilão')).toHaveCount(0);

  await changeDocument(master, id, { visibility: 'public' });
  const caioPanel = await expandDocument(caio, await openLibrary(caio), 'Crônicas');
  await expect(documentTabsOf(caioPanel).getByRole('tab')).toHaveText(['Itens', 'Geral']);
  await expect(caioPanel.getByRole('button', { name: 'Nova aba' })).toHaveCount(0);
  await expect(caioPanel.getByRole('button', { name: /^Opções da aba / })).toHaveCount(0);
  await documentTabOf(caioPanel, 'Itens').click();
  await expect(caioPanel.getByRole('document', { name: 'Conteúdo do documento' })).toHaveText(
    'Espada longa e corda',
  );
  expect((await caio.request.get(`/api/assets/${assetId}`)).status()).toBe(404);
});

test('the detached document window opens on the active tab and shares it with the room', async ({
  newPlayerPage,
}) => {
  test.setTimeout(120_000);
  const master = await newPlayerPage();
  const library = await openTable(master, `Aba na janela ${Date.now()}`);
  await createDocument(master, library, 'Mapa do tesouro');
  const panel = documentPanelOf(master);
  await createDocumentTab(panel, 'Itens');
  await writeInTab(panel, 'Itens', 'Pá e lanterna');
  const opened = master.waitForEvent('popup');
  await panel.getByRole('button', { name: 'Abrir documento em janela', exact: true }).click();
  const popup = await opened;
  const detached = documentPanelOf(popup);
  await expect(documentTabOf(detached, 'Itens')).toHaveAttribute('aria-selected', 'true');
  await expect(bodyOf(detached)).toHaveText('Pá e lanterna');
  await documentTabOf(detached, 'Geral').click();
  await expect(documentTabOf(detached, 'Geral')).toHaveAttribute('aria-selected', 'true');
  await popup.close();
  const back = documentPanelOf(master);
  await expect(documentTabOf(back, 'Geral')).toHaveAttribute('aria-selected', 'true');
  await documentTabOf(back, 'Itens').click();
  await expect(bodyOf(back)).toHaveText('Pá e lanterna');
});
