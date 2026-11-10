import { expect } from '@playwright/test';
import { BIA, CAIO } from './support/dev-players';
import {
  campaignIdOf,
  changeDocument,
  createDocument,
  documentUrl,
  expandDocument,
  pastePortraitIntoDocument,
  readDocument,
  readTabContent,
  showDocumentTab,
} from './support/documents';
import { gridItemOf, gridTabsOf, openLibrary, pickGrid } from './support/library';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import {
  boardOf,
  createTableAndReadCode,
  enterFromTheList,
  joinByCodeAndEnter,
} from './support/tables';

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
  // The DOM caret moves before ProseMirror reads it; Enter too early replaces the stale "Carta" selection.
  await expect(panel.getByRole('button', { name: 'Negrito', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await editor.press('Enter');
  await expect(editor).toContainText('Carta secreta');
  await panel.getByRole('button', { name: 'Inserir tabela', exact: true }).click();
  await expect(editor.locator('tr')).toHaveCount(2);
  await panel.getByRole('button', { name: 'Mais opções de formatação', exact: true }).click();
  await master.getByRole('menuitem', { name: 'Adicionar linha', exact: true }).click();
  await expect(editor.locator('tr')).toHaveCount(3);
  await editor.locator('p').first().click();
  // Same race as above: until ProseMirror reads the click its selection is still in the table
  // (where "Inserir tabela" is off), and End + Enter would drop the image into a cell.
  await expect(panel.getByRole('button', { name: 'Inserir tabela', exact: true })).toBeEnabled();
  await editor.press('End');
  await editor.press('Enter');
  await pastePortraitIntoDocument(master);
  const image = editor.locator('img');
  await image.click();
  const width = panel.getByLabel('Largura da imagem em pixels');
  await width.fill('160');
  await width.press('Enter');
  await panel.getByRole('button', { name: 'Alinhamento da imagem' }).click();
  await master.getByRole('menuitemradio', { name: 'Centralizado' }).click();
  const centerOffset = (locator = image) =>
    locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const body = element.closest('.document-prose')!.getBoundingClientRect();
      return Math.abs(rect.x + rect.width / 2 - (body.x + body.width / 2));
    });
  await expect.poll(() => centerOffset()).toBeLessThan(1);
  await expect(editor.locator('[data-image-resize-corner]:visible')).toHaveCount(4);
  const corner = editor.locator('[data-image-resize-corner="bottom-right"]');
  const handle = (await corner.boundingBox())!;
  const originalSize = (await image.boundingBox())!;
  await master.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await master.mouse.down();
  await master.mouse.move(handle.x + handle.width / 2 + 50, handle.y + handle.height / 2 + 5);
  const previewSize = (await image.boundingBox())!;
  expect(previewSize.width).toBeGreaterThan(originalSize.width);
  expect(previewSize.height / previewSize.width).toBeCloseTo(
    originalSize.height / originalSize.width,
  );
  await master.mouse.up();
  await expect.poll(() => centerOffset()).toBeLessThan(1);
  await expect.poll(() => readTabContent(master, id, 'Geral')).toContain('24px');
  await expect.poll(() => readTabContent(master, id, 'Geral')).toContain('"align":"center"');
  await expect
    .poll(() => readTabContent(master, id, 'Geral'))
    .toContain(`"width":${previewSize.width}`);
  await expect(panel.getByRole('status').filter({ hasText: /^Salvo$/ })).toBeVisible();
  await master.screenshot({ path: testInfo.outputPath('document-toolbar-and-table.png') });
  await master.reload();
  const reopened = await openLibrary(master);
  const restoredPanel = await expandDocument(master, reopened, 'Carta da rainha');
  const restored = restoredPanel.getByRole('textbox', { name: 'Conteúdo do documento' });
  await expect(restored.locator('strong')).toHaveText('Carta');
  await expect(restored.locator('tr')).toHaveCount(3);
  await expect(restored.locator('img')).toHaveCount(1);
  await expect(restored.locator('img')).toHaveCSS('width', `${previewSize.width}px`);
  await expect.poll(() => centerOffset(restored.locator('img'))).toBeLessThan(1);
  await expect(restored.locator('[data-image-resize-corner]:visible')).toHaveCount(0);
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
  await showDocumentTab(master, 'Carta da rainha');
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
    .poll(() => readTabContent(master, id, 'Geral'))
    .toContain('Rascunho salvo pela janela separada');
  await expect(boardOf(master)).toBeVisible();
  await popup.close();
  await showDocumentTab(master, 'Anotações em janela');
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
