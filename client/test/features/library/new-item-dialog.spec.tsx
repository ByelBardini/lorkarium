import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { NEW_FOLDER, NEW_GRID } from '../../support/library-api-fake';
import { ATO_1, masterLibrary } from '../../support/library-fixtures';
import { openLibrary } from '../../support/library-harness';
import {
  menuItemNames,
  newItemDialog,
  openTreeMenu,
  pickNewItemKind,
  startHeaderNewItem,
  treeItem,
} from '../../support/library-tree';

describe('the "Novo item" dialog of the library', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
  });

  function button(dialog: HTMLElement, name: string): HTMLElement {
    return within(dialog).getByRole('button', { name });
  }

  it('offers one card per type and creates nothing until a type is chosen', async () => {
    await openLibrary(deps);
    await userEvent.click(screen.getByRole('button', { name: 'Novo' }));
    const dialog = await newItemDialog();
    const cards = within(within(dialog).getByRole('group', { name: 'Tipo do item' }));
    expect(cards.getAllByRole('button').map((card) => card.textContent)).toEqual([
      'Grid',
      'Imagem',
      'Mapa',
      'Documento',
      'Ficha',
      'Modelo de ficha',
      'Pasta',
    ]);
    expect(button(dialog, 'Criar')).toBeDisabled();
    expect(within(dialog).queryByRole('textbox', { name: 'Nome' })).toBeNull();
  });

  it('choosing a card marks only that one and moves the focus to its name', async () => {
    await openLibrary(deps);
    const dialog = await startHeaderNewItem('Grid');
    expect(button(dialog, 'Grid')).toHaveAttribute('aria-pressed', 'true');
    expect(button(dialog, 'Pasta')).toHaveAttribute('aria-pressed', 'false');
    expect(within(dialog).getByRole('textbox', { name: 'Nome' })).toHaveFocus();
    await pickNewItemKind('Pasta');
    expect(button(dialog, 'Grid')).toHaveAttribute('aria-pressed', 'false');
    expect(within(dialog).getByRole('textbox', { name: 'Nome' })).toHaveFocus();
  });

  it('says where the item goes: the root from the header, the folder from its menu', async () => {
    await openLibrary(deps);
    await userEvent.click(screen.getByRole('button', { name: 'Novo' }));
    expect(await newItemDialog()).toHaveAccessibleDescription('Vai para Sem pasta.');
    await userEvent.click(button(await newItemDialog(), 'Cancelar'));
    await userEvent.click(
      within(await openTreeMenu(treeItem('Ato 1'))).getByRole('menuitem', {
        name: 'Criar novo item',
      }),
    );
    expect(await newItemDialog()).toHaveAccessibleDescription('Vai para Ato 1.');
  });

  it('a grid goes with the name typed, trimmed', async () => {
    await openLibrary(deps);
    const dialog = await startHeaderNewItem('Grid');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nome' }), '  Torre ');
    await userEvent.click(button(dialog, 'Criar'));
    expect(deps.libraryApi.callsOf('createScene')).toEqual([[{ folderId: null, name: 'Torre' }]]);
    expect(screen.queryByRole('dialog', { name: 'Novo item' })).toBeNull();
  });

  it('a grid left blank goes without a name and is picked with its name focused', async () => {
    await openLibrary(deps);
    deps.libraryApi.answer('list', {
      ok: true,
      value: masterLibrary({ scenes: [...masterLibrary().scenes, NEW_GRID] }),
    });
    const dialog = await startHeaderNewItem('Grid');
    expect(within(dialog).getByRole('textbox', { name: 'Nome' })).toHaveAttribute(
      'placeholder',
      'Grid sem nome',
    );
    await userEvent.click(button(dialog, 'Criar'));
    expect(deps.libraryApi.callsOf('createScene')).toEqual([[{ folderId: null }]]);
    expect(await screen.findByRole('textbox', { name: 'Nome' })).toHaveFocus();
  });

  it('a folder demands a name, and Enter creates it inside the folder of the menu', async () => {
    await openLibrary(deps);
    deps.libraryApi.answer('list', {
      ok: true,
      value: masterLibrary({
        folders: [...masterLibrary().folders, { ...NEW_FOLDER, parentId: ATO_1.id }],
      }),
    });
    await userEvent.click(
      within(await openTreeMenu(treeItem('Ato 1'))).getByRole('menuitem', {
        name: 'Criar novo item',
      }),
    );
    const dialog = await pickNewItemKind('Pasta');
    expect(button(dialog, 'Criar')).toBeDisabled();
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nome' }), 'Masmorra{Enter}');
    expect(deps.libraryApi.callsOf('createFolder')).toEqual([
      [{ name: 'Masmorra', parentId: ATO_1.id, visibility: 'public' }],
    ]);
    expect(await screen.findByRole('treeitem', { name: 'Masmorra' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(treeItem('Ato 1')).toHaveAttribute('aria-expanded', 'true');
  });

  it('a folder chosen as private goes private', async () => {
    await openLibrary(deps);
    const dialog = await startHeaderNewItem('Pasta');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Privada' }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nome' }), 'Segredos{Enter}');
    expect(deps.libraryApi.callsOf('createFolder')).toEqual([
      [{ name: 'Segredos', parentId: null, visibility: 'private' }],
    ]);
  });

  it('"Cancelar" and a search: nothing is created and the search stays until something is', async () => {
    await openLibrary(deps);
    const search = screen.getByRole('searchbox', { name: 'Buscar item' });
    await userEvent.type(search, 'estrada');
    let dialog = await startHeaderNewItem('Pasta');
    await userEvent.click(button(dialog, 'Cancelar'));
    expect(search).toHaveValue('estrada');
    expect(deps.libraryApi.callsOf('createFolder')).toEqual([]);
    dialog = await startHeaderNewItem('Pasta');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nome' }), 'Ato 3{Enter}');
    await waitFor(() => expect(search).toHaveValue(''));
  });

  it('while reconnecting nothing can be created from an open dialog', async () => {
    await openLibrary(deps);
    const dialog = await startHeaderNewItem('Grid');
    deps.tableSessionApi.emit({ kind: 'status', status: 'reconnecting' });
    await waitFor(() => expect(button(dialog, 'Criar')).toBeDisabled());
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nome' }), 'Torre{Enter}');
    expect(deps.libraryApi.callsOf('createScene')).toEqual([]);
  });

  it('the tree menu has one way to create and keeps the actions of the folder apart', async () => {
    await openLibrary(deps);
    expect(menuItemNames(await openTreeMenu(treeItem('Ato 1')))).toEqual([
      'Criar novo item',
      'Importar modelo…',
      'Tornar privada',
      'Renomear',
      'Mover para…',
      'Excluir pasta',
    ]);
  });
});
