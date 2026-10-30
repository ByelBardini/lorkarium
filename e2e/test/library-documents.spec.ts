import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { BIA, CAIO } from './support/dev-players';
import { gridItemOf, gridTabsOf, openLibrary, pickGrid } from './support/library';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import {
  boardOf,
  createTableAndReadCode,
  enterFromTheList,
  joinByCodeAndEnter,
} from './support/tables';

type DocumentRecord = {
  id: string;
  name: string;
  version: number;
  content: object;
  ownerIds?: string[];
};
function campaignIdOf(page: Page): string {
  const id = /\/campaigns\/([0-9a-f-]{36})/.exec(new URL(page.url()).pathname)?.[1];
  if (!id) throw new Error(`Expected campaign ID in ${page.url()}`);
  return id;
}
function documentUrl(page: Page, documentId: string): string {
  return `/api/campaigns/${campaignIdOf(page)}/documents/${documentId}`;
}
async function createDocument(page: Page, library: Locator, name: string): Promise<string> {
  await library.getByRole('button', { name: 'Criar item' }).click();
  const created = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/documents'),
  );
  await page.getByRole('menuitem', { name: 'Novo documento', exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const answer: { document: DocumentRecord } = await response.json();
  await library.getByRole('button', { name: 'Expandir documento', exact: true }).click();
  await expect(library).toBeHidden();
  const panel = page.getByRole('region', { name: 'Documento escolhido' });
  const title = panel.getByRole('textbox', { name: 'Nome do documento' });
  await expect(title).toBeFocused();
  await title.fill(name);
  await expect.poll(async () => (await readDocument(page, answer.document.id)).name).toBe(name);
  await expect(panel.getByRole('status').filter({ hasText: /^Salvo$/ })).toBeVisible();
  await expect(gridTabsOf(page).getByRole('tab', { name, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  return answer.document.id;
}
async function expandDocument(page: Page, library: Locator, name: string): Promise<Locator> {
  await pickGrid(library, name);
  await expect(library.getByRole('region', { name: 'Prévia do documento' })).toBeVisible();
  await expect(library.getByRole('toolbar', { name: 'Formatação do documento' })).toHaveCount(0);
  await library.getByRole('button', { name: 'Expandir documento', exact: true }).click();
  await expect(library).toBeHidden();
  const panel = page.getByRole('region', { name: 'Documento escolhido' });
  await expect(panel).toBeVisible();
  return panel;
}
async function readDocument(page: Page, id: string): Promise<DocumentRecord> {
  const response = await page.request.get(documentUrl(page, id));
  expect(response.status()).toBe(200);
  const answer: { document: DocumentRecord } = await response.json();
  return answer.document;
}
async function changeDocument(page: Page, id: string, changes: object): Promise<void> {
  const current = await readDocument(page, id);
  const response = await page.request.patch(documentUrl(page, id), {
    data: { actionId: crypto.randomUUID(), expectedVersion: current.version, ...changes },
  });
  expect(response.status()).toBe(200);
}

test('rich document formats a selection, expands a table, and survives reload', async ({
  newPlayerPage,
}, testInfo) => {
  test.setTimeout(120_000);
  const master = await newPlayerPage();
  await signIn(master, adminCredentials());
  const table = `Documento rico ${Date.now()}`;
  await createTableAndReadCode(master, table);
  await enterFromTheList(master, table);
  const library = await openLibrary(master);
  const id = await createDocument(master, library, 'Carta da rainha');
  const panel = master.getByRole('region', { name: 'Documento escolhido' });
  const editor = panel.getByRole('textbox', { name: 'Conteúdo do documento' });
  await editor.fill('Carta secreta');
  await editor.click();
  await editor.press('Home');
  for (let index = 0; index < 5; index++) {
    await editor.press('Shift+ArrowRight');
  }
  await expect
    .poll(() => master.evaluate<string>('window.getSelection()?.toString()'))
    .toBe('Carta');
  await panel.getByRole('button', { name: 'Negrito', exact: true }).click();
  await expect(editor.locator('strong')).toHaveText('Carta');
  await panel.getByRole('button', { name: 'Fonte', exact: true }).click();
  await master.getByRole('menuitemradio', { name: 'Cormorant Garamond', exact: true }).click();
  await panel.getByLabel('Tamanho da fonte', { exact: true }).fill('24');
  await panel.getByLabel('Tamanho da fonte', { exact: true }).press('Enter');
  await expect(editor.locator('strong')).toHaveText('Carta');
  await expect(editor).toHaveText('Carta secreta');
  await editor.click();
  await editor.press('Control+End');
  await expect.poll(() => master.evaluate<string>('window.getSelection()?.toString()')).toBe('');
  await editor.press('Enter');
  await expect(editor).toContainText('Carta secreta');
  await panel.getByRole('button', { name: 'Inserir tabela', exact: true }).click();
  await expect(editor.locator('tr')).toHaveCount(2);
  await panel.getByRole('button', { name: 'Mais opções de formatação', exact: true }).click();
  await master.getByRole('menuitem', { name: 'Adicionar linha', exact: true }).click();
  await expect(editor.locator('tr')).toHaveCount(3);
  const imageBytes = readFileSync(
    new URL('./fixtures/library-portrait.png', import.meta.url),
  ).toString('base64');
  await master.evaluate<void>(
    `(() => {
    const element=document.querySelector('[aria-label="Conteúdo do documento"]');
    const encoded=${JSON.stringify(imageBytes)};
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const clipboard = new DataTransfer();
    clipboard.items.add(new File([bytes], 'retrato.png', { type: 'image/png' }));
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }),
    );
  })()`,
  );
  await expect(editor.locator('img')).toHaveCount(1);
  await expect
    .poll(async () => JSON.stringify((await readDocument(master, id)).content))
    .toContain('24px');
  await expect(panel.getByRole('status').filter({ hasText: /^Salvo$/ })).toBeVisible();
  await master.screenshot({ path: testInfo.outputPath('document-toolbar-and-table.png') });
  await master.reload();
  const reopened = await openLibrary(master);
  const restoredPanel = await expandDocument(master, reopened, 'Carta da rainha');
  const restored = restoredPanel.getByRole('textbox', { name: 'Conteúdo do documento' });
  await expect(restored.locator('strong')).toHaveText('Carta');
  await expect(restored.locator('tr')).toHaveCount(3);
  await expect(restored.locator('img')).toHaveCount(1);
  await expect
    .poll(() =>
      restored
        .locator('img')
        .evaluate((image) => ('naturalWidth' in image ? Number(image.naturalWidth) : 0)),
    )
    .toBeGreaterThan(0);
  await expect(restored.locator('table')).toBeVisible();
  await master.screenshot({ path: testInfo.outputPath('document-expanded.png') });
  const tabs = gridTabsOf(master);
  await tabs.getByRole('tab', { name: /Grupo/ }).click();
  await expect(boardOf(master)).toBeVisible();
  await expect(restoredPanel).toBeHidden();
  await tabs.getByRole('tab', { name: 'Carta da rainha', exact: true }).click();
  await expect(restored.locator('table')).toBeVisible();
  await tabs.getByRole('button', { name: 'Fechar documento Carta da rainha', exact: true }).click();
  await expect(tabs.getByRole('tab', { name: 'Carta da rainha', exact: true })).toHaveCount(0);
  await expect(boardOf(master)).toBeVisible();
});

test('multiple document owners edit a hidden document and live revocation removes its body', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const master = await newPlayerPage();
  const bia = await newPlayerPage();
  const caio = await newPlayerPage();
  await signIn(master, adminCredentials());
  const table = `Posse de documento ${Date.now()}`;
  const code = await createTableAndReadCode(master, table);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code, master);
  await signIn(caio, CAIO);
  await joinByCodeAndEnter(caio, code, master);
  await enterFromTheList(master, table);
  const library = await openLibrary(master);
  const id = await createDocument(master, library, 'Segredo dos dois');
  const panel = master.getByRole('region', { name: 'Documento escolhido' });
  const biaLibrary = await openLibrary(bia);
  const caioLibrary = await openLibrary(caio);
  await expect(gridItemOf(biaLibrary, 'Segredo dos dois')).toHaveCount(0);
  expect((await bia.request.get(documentUrl(master, id))).status()).toBe(404);
  const hidden = await bia.request.get(`/api/campaigns/${campaignIdOf(master)}/library`);
  expect(await hidden.text()).not.toContain('Segredo dos dois');
  await panel.getByRole('button', { name: 'Compartilhamento', exact: true }).click();
  await master.getByRole('checkbox', { name: 'Bia', exact: true }).check();
  await master.getByRole('checkbox', { name: 'Caio', exact: true }).check();
  await master.getByRole('button', { name: 'Salvar donos', exact: true }).click();
  const biaPanel = await expandDocument(bia, biaLibrary, 'Segredo dos dois');
  const caioPanel = await expandDocument(caio, caioLibrary, 'Segredo dos dois');
  await expect(biaPanel.getByRole('button', { name: 'Compartilhamento' })).toHaveCount(0);
  const biaEditor = biaPanel.getByRole('textbox', { name: 'Conteúdo do documento' });
  await biaEditor.fill('Mensagem dos donos');
  await expect(biaPanel.getByRole('status').filter({ hasText: /^Salvo$/ })).toBeVisible();
  await expect(caioPanel.getByRole('textbox', { name: 'Conteúdo do documento' })).toHaveText(
    'Mensagem dos donos',
  );
  const caioProfile: { user: { id: string } } = await (
    await caio.request.get('/api/auth/me')
  ).json();
  await changeDocument(master, id, { ownerIds: [caioProfile.user.id] });
  await expect(bia.getByRole('textbox', { name: 'Conteúdo do documento' })).toHaveCount(0);
  await expect(bia.getByText('Mensagem dos donos')).toHaveCount(0);
  expect((await bia.request.get(documentUrl(master, id))).status()).toBe(404);
  await changeDocument(master, id, { visibility: 'public' });
  const publicPanel = await expandDocument(bia, await openLibrary(bia), 'Segredo dos dois');
  await expect(publicPanel.getByRole('document', { name: 'Conteúdo do documento' })).toHaveText(
    'Mensagem dos donos',
  );
  await expect(publicPanel.getByRole('toolbar', { name: 'Formatação do documento' })).toHaveCount(
    0,
  );
});

test('document popup opens directly from preview and saves while the primary window shows the grid', async ({
  newPlayerPage,
}) => {
  test.setTimeout(120_000);
  const master = await newPlayerPage();
  await signIn(master, adminCredentials());
  const table = `Janela de documento ${Date.now()}`;
  await createTableAndReadCode(master, table);
  await enterFromTheList(master, table);
  const id = await createDocument(master, await openLibrary(master), 'Anotações em janela');
  await gridTabsOf(master)
    .getByRole('button', { name: 'Fechar documento Anotações em janela', exact: true })
    .click();
  await expect(boardOf(master)).toBeVisible();
  const library = await openLibrary(master);
  await pickGrid(library, 'Anotações em janela');
  await expect(library.getByRole('region', { name: 'Prévia do documento' })).toBeVisible();
  await expect(library.getByRole('textbox', { name: 'Conteúdo do documento' })).toHaveCount(0);
  const opened = master.waitForEvent('popup');
  await library
    .getByRole('button', { name: 'Abrir documento em outra janela', exact: true })
    .click();
  const popup = await opened;
  const panel = popup.getByRole('region', { name: 'Documento escolhido' });
  await expect(panel).toBeVisible();
  await library.getByRole('button', { name: 'Fechar biblioteca', exact: true }).click();
  await expect(boardOf(master)).toBeVisible();
  await expect(gridTabsOf(master).getByRole('tab', { name: /Grupo/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await panel
    .getByRole('textbox', { name: 'Conteúdo do documento' })
    .fill('Rascunho salvo pela janela separada');
  await expect(panel.getByRole('status').filter({ hasText: /^Salvo$/ })).toBeVisible();
  await expect
    .poll(async () => JSON.stringify((await readDocument(master, id)).content))
    .toContain('Rascunho salvo pela janela separada');
  await expect(boardOf(master)).toBeVisible();
  await popup.close();
  await gridTabsOf(master).getByRole('tab', { name: 'Anotações em janela', exact: true }).click();
  await expect(
    master
      .getByRole('region', { name: 'Documento escolhido' })
      .getByRole('textbox', { name: 'Conteúdo do documento' }),
  ).toHaveText('Rascunho salvo pela janela separada');
});

test('concurrent remote editing preserves the local draft and offers loading the confirmed version', async ({
  newPlayerPage,
}) => {
  test.setTimeout(120_000);
  const master = await newPlayerPage();
  await signIn(master, adminCredentials());
  const table = `Conflito de documento ${Date.now()}`;
  await createTableAndReadCode(master, table);
  await enterFromTheList(master, table);
  const library = await openLibrary(master);
  const id = await createDocument(master, library, 'Versão original');
  const panel = master.getByRole('region', { name: 'Documento escolhido' });
  let resume: (() => void) | undefined;
  let arrived: (() => void) | undefined;
  const paused = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const requestStarted = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await master.route(
    `**/documents/${id}/content`,
    async (route) => {
      arrived?.();
      await paused;
      await route.continue();
    },
    { times: 1 },
  );
  await panel.getByRole('textbox', { name: 'Nome do documento' }).fill('Meu rascunho preservado');
  await requestStarted;
  const confirmed = await readDocument(master, id);
  const remote = await master.request.patch(`${documentUrl(master, id)}/content`, {
    data: {
      actionId: crypto.randomUUID(),
      expectedVersion: confirmed.version,
      name: 'Edição remota',
    },
  });
  expect(remote.status()).toBe(200);
  resume?.();
  await expect(
    panel.getByText('Outra edição foi salva. Seu rascunho foi preservado.'),
  ).toBeVisible();
  await expect(panel.getByRole('textbox', { name: 'Nome do documento' })).toHaveValue(
    'Meu rascunho preservado',
  );
  await expect(
    panel.getByRole('button', { name: 'Copiar meu rascunho', exact: true }),
  ).toBeVisible();
  expect((await readDocument(master, id)).name).toBe('Edição remota');
  await panel.getByRole('button', { name: 'Carregar versão atual', exact: true }).click();
  await master
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Descartar alterações', exact: true })
    .click();
  await expect(panel.getByRole('textbox', { name: 'Nome do documento' })).toHaveValue(
    'Edição remota',
  );
});
