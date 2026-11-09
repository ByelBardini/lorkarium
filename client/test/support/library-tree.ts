import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/** The tree of the open library ("Itens e pastas").
 *
 *  Example: `within(libraryTree()).getAllByRole('treeitem')` */
export function libraryTree(): HTMLElement {
  return screen.getByRole('tree', { name: 'Itens e pastas' });
}

/** A folder or grid of the tree, by its name (it must be showing).
 *
 *  Example: `await userEvent.click(treeItem('Ato 1'))` */
export function treeItem(name: string): HTMLElement {
  return within(libraryTree()).getByRole('treeitem', { name });
}

/** The names of the items the tree shows, top to bottom.
 *
 *  Example: `expect(treeItemNames()).toEqual(['Ato 1', 'Lugares fixos', 'Sem pasta', 'Cena 1'])` */
export function treeItemNames(): string[] {
  return within(libraryTree())
    .queryAllByRole('treeitem')
    .map((item) => item.getAttribute('aria-label') ?? '');
}

/** Clicks Ato 1 and Catacumbas open (VHARN's master library), so the Torre and the Ossuário show.
 *
 *  Example: `await openCatacumbas(); treeItem('Ossuário')` */
export async function openCatacumbas(): Promise<void> {
  await userEvent.click(treeItem('Ato 1'));
  await userEvent.click(treeItem('Catacumbas'));
}

/** Right click on `target` (an item, or the tree area): the context menu that opens.
 *
 *  Example: `const menu = await openTreeMenu(treeItem('Ato 1'))` */
export async function openTreeMenu(target: HTMLElement): Promise<HTMLElement> {
  fireEvent.contextMenu(target);
  return screen.findByRole('menu');
}

/** The names of the items of an open menu.
 *
 *  Example: `expect(menuItemNames(menu)).toEqual(['Renomear', 'Duplicar', 'Excluir grid'])` */
export function menuItemNames(menu: HTMLElement): string[] {
  return within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent ?? '');
}

/** The "Novo item" dialog once it is open.
 *
 *  Example: `expect(await newItemDialog()).toHaveAccessibleDescription('Vai para Ato 1.')` */
export function newItemDialog(): Promise<HTMLElement> {
  return screen.findByRole('dialog', { name: 'Novo item' });
}

/** Picks the type on the open "Novo item"; resolves to the dialog.
 *
 *  Example: `const dialog = await pickNewItemKind('Pasta')` */
export async function pickNewItemKind(kind: string): Promise<HTMLElement> {
  const dialog = await newItemDialog();
  await userEvent.click(within(dialog).getByRole('button', { name: kind }));
  return dialog;
}

/** The header's "Criar item" with the type already picked; resolves to the dialog.
 *
 *  Example: `const dialog = await startHeaderNewItem('Grid')` */
export async function startHeaderNewItem(kind: string): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('button', { name: 'Criar item' }));
  return pickNewItemKind(kind);
}
