import { expect, type Locator, type Page } from '@playwright/test';

/** Opens the library over the room by the "Biblioteca" link of its top bar and waits for the list.
 *
 *  Example: `const library = await openLibrary(admin); await library.getByRole('button', { name: 'Novo grid' }).click()` */
export async function openLibrary(page: Page): Promise<Locator> {
  await page.getByRole('link', { name: 'Biblioteca', exact: true }).click();
  const library = page.getByRole('dialog', { name: 'Biblioteca', exact: true });
  await expect(treeOf(library)).toBeVisible();
  return library;
}

/** The tree of the open library ("Grids e pastas"): folders, grids and "Sem pasta". */
export function treeOf(library: Locator): Locator {
  return library.getByRole('tree', { name: 'Itens e pastas' });
}

/** A grid (or folder) item of the library tree, by its name; it shows only inside open folders.
 *
 *  Example: `await gridItemOf(library, 'Cena 1').click()` */
export function gridItemOf(library: Locator, name: string): Locator {
  return treeOf(library).getByRole('treeitem', { name, exact: true });
}

/** Picks a grid wherever it sits: the search opens the folders above it, then is cleared.
 *
 *  Example: `await pickGrid(library, 'Torre')` */
export async function pickGrid(library: Locator, name: string): Promise<void> {
  const search = library.getByRole('searchbox', { name: 'Buscar item' });
  await search.fill(name);
  await gridItemOf(library, name).click();
  await search.fill('');
  await expect(gridItemOf(library, name)).toHaveAttribute('aria-selected', 'true');
}

/** The tab strip at the top of the room ("Grids abertos"). */
export function gridTabsOf(page: Page): Locator {
  return page.getByRole('tablist', { name: 'Grids abertos' });
}

/** The notice of the grid tabs (an activation, a tab closed by the server). */
export function gridNoticeOf(page: Page): Locator {
  return page.getByRole('status', { name: 'Aviso dos grids' });
}

/** "Novo grid" of the header (in the folder picked, or the picked grid's), named by its "Nome"
 *  field (Enter saves).
 *
 *  Example: `await createGrid(library, 'Torre')` */
export async function createGrid(library: Locator, name: string): Promise<void> {
  await library.getByRole('button', { name: 'Criar item' }).click();
  await library.page().getByRole('menuitem', { name: 'Novo grid', exact: true }).click();
  await nameNewGrid(library, name);
}

/** Names the grid just created (a "Novo grid" of the header or of the tree menu): its "Nome" field
 *  takes the focus.
 *
 *  Example: `await nameNewGrid(library, 'Estrada')` */
export async function nameNewGrid(library: Locator, name: string): Promise<void> {
  const field = library.getByRole('region', { name: 'Grid escolhido' }).getByLabel('Nome');
  await expect(field).toBeFocused();
  await field.fill(name);
  await field.press('Enter');
  await expect(gridItemOf(library, name)).toBeVisible();
}

/** "Nova pasta" inside the folder open in the tree; the new folder opens.
 *
 *  Example: `await createFolder(library, 'Ato 1')` */
export async function createFolder(library: Locator, name: string): Promise<void> {
  await library.getByRole('button', { name: 'Nova pasta' }).click();
  const field = library.getByRole('textbox', { name: 'Nome da nova pasta' });
  await field.fill(name);
  await field.press('Enter');
  await expect(library.getByRole('treeitem', { name, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
}

/** Picks a grid and presses "Levar o grupo pra cá" (master), waiting for "O grupo está aqui".
 *
 *  Example: `await takeTheGroupTo(library, 'Estrada')` */
export async function takeTheGroupTo(library: Locator, name: string): Promise<void> {
  await pickGrid(library, name);
  const details = library.getByRole('region', { name: 'Grid escolhido' });
  await details.getByRole('button', { name: 'Levar o grupo pra cá' }).click();
  await expect(details.getByRole('button', { name: 'O grupo está aqui' })).toBeDisabled();
}

/** Picks a grid and sets "Quem vê na biblioteca" (master).
 *
 *  Example: `await setGridVisibility(library, 'Torre', 'Público')` */
export async function setGridVisibility(
  library: Locator,
  name: string,
  visibility: 'Público' | 'Privado',
): Promise<void> {
  await pickGrid(library, name);
  const radio = library
    .getByRole('radiogroup', { name: 'Quem vê na biblioteca' })
    .getByRole('radio', { name: visibility });
  await radio.click();
  await expect(radio).toBeChecked();
}
