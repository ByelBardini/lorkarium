import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gridTabsOf, pickGrid } from './library';

export type DocumentTabRecord = Readonly<{
  id: string;
  name: string;
  visibility: 'document' | 'masters';
  version: number;
}>;
export type DocumentRecord = Readonly<{
  id: string;
  name: string;
  version: number;
  tabs: readonly DocumentTabRecord[];
  ownerIds?: string[];
}>;

/** The campaign id in the room's address. Example: `campaignIdOf(master)` */
export function campaignIdOf(page: Page): string {
  const id = /\/campaigns\/([0-9a-f-]{36})/.exec(new URL(page.url()).pathname)?.[1];
  if (!id) throw new Error(`expected a campaign id in the page address; received ${page.url()}`);
  return id;
}

/** The API path of a document of the campaign open in `page`. Example: `documentUrl(master, id)` */
export function documentUrl(page: Page, documentId: string): string {
  return `/api/campaigns/${campaignIdOf(page)}/documents/${documentId}`;
}

/** Creates a document from the library header, expands it and names it; resolves to its id.
 *
 *  Example: `const id = await createDocument(master, await openLibrary(master), 'Diário')` */
export async function createDocument(page: Page, library: Locator, name: string): Promise<string> {
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
  const panel = documentPanelOf(page);
  const title = panel.getByRole('textbox', { name: 'Nome do documento' });
  await expect(title).toBeFocused();
  await title.fill(name);
  await expect.poll(async () => (await readDocument(page, answer.document.id)).name).toBe(name);
  await expect(savedStatusOf(panel)).toBeVisible();
  await expect(gridTabsOf(page).getByRole('tab', { name, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  return answer.document.id;
}

/** Picks a document in the open library, checks its read-only preview and expands it.
 *
 *  Example: `const panel = await expandDocument(bia, await openLibrary(bia), 'Diário')` */
export async function expandDocument(page: Page, library: Locator, name: string): Promise<Locator> {
  await pickGrid(library, name);
  await expect(library.getByRole('region', { name: 'Prévia do documento' })).toBeVisible();
  await expect(library.getByRole('toolbar', { name: 'Formatação do documento' })).toHaveCount(0);
  await library.getByRole('button', { name: 'Expandir documento', exact: true }).click();
  await expect(library).toBeHidden();
  const panel = documentPanelOf(page);
  await expect(panel).toBeVisible();
  return panel;
}

/** The expanded document panel ("Documento escolhido"), in the room or in its own window. */
export function documentPanelOf(page: Page): Locator {
  return page.getByRole('region', { name: 'Documento escolhido' });
}

/** The header status once both the name and the shown tab are saved. */
export function savedStatusOf(panel: Locator): Locator {
  return panel.getByRole('status').filter({ hasText: /^Salvo$/ });
}

// Whether an inactive document fits the strip or sits in "+N" depends on the room's width and on
// how many tabs are open, so the helper takes whichever the strip shows.
/** Shows a document tab of the room, from the strip or the "+N" menu. Example: `await showDocumentTab(page, 'Diário')` */
export async function showDocumentTab(page: Page, name: string): Promise<void> {
  const tab = gridTabsOf(page).getByRole('tab', { name, exact: true });
  const more = page.getByRole('button', { name: /^Mais \d+ abas?$/ });
  await expect(tab.or(more).first()).toBeVisible();
  if (await tab.isVisible()) {
    await tab.click();
  } else {
    await more.click();
    await page.getByRole('menuitem', { name, exact: true }).click();
  }
  await expect(gridTabsOf(page).getByRole('tab', { name, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
}

/** The document as `page` reads it (only the tabs it sees, without bodies). */
export async function readDocument(page: Page, id: string): Promise<DocumentRecord> {
  const response = await page.request.get(documentUrl(page, id));
  expect(response.status()).toBe(200);
  const answer: { document: DocumentRecord } = await response.json();
  return answer.document;
}

/** Applies a versioned `PATCH` of the document (sharing, visibility) at its current version.
 *
 *  Example: `await changeDocument(master, id, { visibility: 'public' })` */
export async function changeDocument(page: Page, id: string, changes: object): Promise<void> {
  const current = await readDocument(page, id);
  const response = await page.request.patch(documentUrl(page, id), {
    data: { actionId: crypto.randomUUID(), expectedVersion: current.version, ...changes },
  });
  expect(response.status()).toBe(200);
}

/** The id of the tab named `name` among the ones `page` sees. Example: `await tabIdOf(master, id, 'Itens')` */
export async function tabIdOf(page: Page, documentId: string, name: string): Promise<string> {
  const tab = (await readDocument(page, documentId)).tabs.find((each) => each.name === name);
  if (!tab) throw new Error(`expected a tab named "${name}" in document ${documentId}; not listed`);
  return tab.id;
}

/** The saved body of a tab, as JSON text, read by `page`.
 *
 *  Example: `await expect.poll(() => readTabContent(master, id, 'Geral')).toContain('24px')` */
export async function readTabContent(
  page: Page,
  documentId: string,
  name: string,
): Promise<string> {
  const tabId = await tabIdOf(page, documentId, name);
  const response = await page.request.get(`${documentUrl(page, documentId)}/tabs/${tabId}`);
  expect(response.status()).toBe(200);
  const answer: { tab: { content: object } } = await response.json();
  return JSON.stringify(answer.tab.content);
}

/** Pastes `fixtures/library-portrait.png` as a file into the visible document editor. */
export async function pastePortraitIntoDocument(page: Page): Promise<void> {
  const imageBytes = readFileSync(
    new URL('../fixtures/library-portrait.png', import.meta.url),
  ).toString('base64');
  await page.evaluate<void>(
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
}
