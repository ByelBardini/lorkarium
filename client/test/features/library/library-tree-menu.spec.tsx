import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { NEW_FOLDER, NEW_GRID } from '../../support/library-api-fake';
import {
  ATO_1,
  CATACUMBAS,
  LUGARES_FIXOS,
  OSSUARIO,
  masterLibrary,
} from '../../support/library-fixtures';
import { openLibrary } from '../../support/library-harness';
import {
  libraryTree,
  menuItemNames,
  openCatacumbas,
  openTreeMenu,
  treeItem,
} from '../../support/library-tree';
import { VHARN_SCENE } from '../../support/table-session-fixtures';

describe('the context menu of the library tree', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
  });

  function panel(): HTMLElement {
    return screen.getByRole('region', { name: 'Grid escolhido' });
  }

  async function choose(target: HTMLElement, action: string): Promise<void> {
    const menu = await openTreeMenu(target);
    await userEvent.click(within(menu).getByRole('menuitem', { name: action }));
  }

  // The empty space under the tree belongs to the root, like "Sem pasta".
  function treeArea(): HTMLElement {
    const area = libraryTree().parentElement;
    if (!area) throw new Error('the tree has no scroll area around it');
    return area;
  }

  describe('what each place offers', () => {
    it('a folder offers creating inside it, renaming, moving and deleting it', async () => {
      await openLibrary(deps);
      expect(menuItemNames(await openTreeMenu(treeItem('Ato 1')))).toEqual([
        'Novo grid aqui',
        'Nova imagem aqui',
        'Nova pasta aqui',
        'Renomear',
        'Mover para…',
        'Excluir pasta',
      ]);
    });

    it('a grid offers renaming, duplicating and deleting it', async () => {
      await openLibrary(deps);
      await openCatacumbas();
      expect(menuItemNames(await openTreeMenu(treeItem('Ossuário')))).toEqual([
        'Renomear',
        'Duplicar',
        'Excluir grid',
      ]);
    });

    it('"Sem pasta" and the empty area offer a grid and a folder at the root', async () => {
      await openLibrary(deps);
      expect(menuItemNames(await openTreeMenu(treeItem('Sem pasta')))).toEqual([
        'Novo grid',
        'Nova imagem',
        'Nova pasta',
      ]);
      await userEvent.keyboard('{Escape}');
      expect(menuItemNames(await openTreeMenu(treeArea()))).toEqual([
        'Novo grid',
        'Nova imagem',
        'Nova pasta',
      ]);
    });

    it('the menu key on the focused item opens the menu of that item', async () => {
      await openLibrary(deps);
      treeItem('Lugares fixos').focus();
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement)) throw new Error('nothing has the focus');
      expect(menuItemNames(await openTreeMenu(focused))).toContain('Excluir pasta');
    });
  });

  describe('creating', () => {
    it('"Novo grid aqui" creates in that folder, opens it and picks the grid with its name focused', async () => {
      await openLibrary(deps);
      deps.libraryApi.answer('list', {
        ok: true,
        value: masterLibrary({
          scenes: [...masterLibrary().scenes, { ...NEW_GRID, folderId: LUGARES_FIXOS.id }],
        }),
      });
      await choose(treeItem('Lugares fixos'), 'Novo grid aqui');
      expect(deps.libraryApi.callsOf('createScene')).toEqual([[{ folderId: LUGARES_FIXOS.id }]]);
      expect(await within(panel()).findByRole('textbox', { name: 'Nome' })).toHaveFocus();
      expect(treeItem('Lugares fixos')).toHaveAttribute('aria-expanded', 'true');
      expect(treeItem('Grid sem nome')).toHaveAttribute('aria-selected', 'true');
    });

    it('"Nova pasta aqui" names the folder inside the one clicked, which opens', async () => {
      await openLibrary(deps);
      deps.libraryApi.answer('list', {
        ok: true,
        value: masterLibrary({
          folders: [...masterLibrary().folders, { ...NEW_FOLDER, parentId: ATO_1.id }],
        }),
      });
      await choose(treeItem('Ato 1'), 'Nova pasta aqui');
      const field = within(treeItem('Ato 1')).getByRole('textbox', { name: 'Nome da nova pasta' });
      expect(field).toHaveFocus();
      expect(treeItem('Ato 1')).toHaveAttribute('aria-expanded', 'true');
      await userEvent.type(field, 'Masmorra{Enter}');
      expect(deps.libraryApi.callsOf('createFolder')).toEqual([
        [{ name: 'Masmorra', parentId: ATO_1.id }],
      ]);
      expect(await screen.findByRole('treeitem', { name: 'Masmorra' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    it('"Novo grid" and "Nova pasta" of the root create without folder', async () => {
      await openLibrary(deps);
      await choose(treeItem('Sem pasta'), 'Novo grid');
      expect(deps.libraryApi.callsOf('createScene')).toEqual([[{ folderId: null }]]);
      await choose(treeArea(), 'Nova pasta');
      await userEvent.type(
        screen.getByRole('textbox', { name: 'Nome da nova pasta' }),
        'Ato 3{Enter}',
      );
      expect(deps.libraryApi.callsOf('createFolder')).toEqual([
        [{ name: 'Ato 3', parentId: null }],
      ]);
    });

    it('creating clears the search, so what is created shows', async () => {
      await openLibrary(deps);
      await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar item' }), 'estrada');
      await choose(treeItem('Ato 1'), 'Nova pasta aqui');
      expect(screen.getByRole('searchbox', { name: 'Buscar item' })).toHaveValue('');
      expect(within(treeItem('Ato 1')).getByRole('treeitem', { name: 'Catacumbas' })).toBeVisible();
    });
  });

  describe('renaming in place', () => {
    it('a grid renamed in its item goes on Enter, and the focus goes back to the item', async () => {
      await openLibrary(deps);
      await openCatacumbas();
      await choose(treeItem('Ossuário'), 'Renomear');
      const field = within(treeItem('Ossuário')).getByRole('textbox', { name: 'Nome do grid' });
      expect(field).toHaveValue('Ossuário');
      await userEvent.clear(field);
      await userEvent.type(field, 'Cripta{Enter}');
      expect(deps.libraryApi.callsOf('updateScene')).toEqual([[OSSUARIO.id, { name: 'Cripta' }]]);
      expect(screen.queryByRole('textbox', { name: 'Nome do grid' })).toBeNull();
      expect(treeItem('Ossuário')).toHaveFocus();
    });

    it('Esc puts the name back, and Enter on the same name sends nothing', async () => {
      await openLibrary(deps);
      await choose(treeItem('Lugares fixos'), 'Renomear');
      const field = screen.getByRole('textbox', { name: 'Nome da pasta' });
      await userEvent.clear(field);
      await userEvent.type(field, 'Cidade{Escape}');
      expect(screen.queryByRole('textbox', { name: 'Nome da pasta' })).toBeNull();
      expect(screen.getByRole('dialog', { name: 'Biblioteca' })).toBeInTheDocument();
      await choose(treeItem('Lugares fixos'), 'Renomear');
      await userEvent.type(screen.getByRole('textbox', { name: 'Nome da pasta' }), '{Enter}');
      expect(deps.libraryApi.callsOf('updateFolder')).toEqual([]);
    });

    it('a folder renamed in its item goes on Enter', async () => {
      await openLibrary(deps);
      await choose(treeItem('Lugares fixos'), 'Renomear');
      const field = screen.getByRole('textbox', { name: 'Nome da pasta' });
      await userEvent.clear(field);
      await userEvent.type(field, 'Cidade{Enter}');
      expect(deps.libraryApi.callsOf('updateFolder')).toEqual([
        [LUGARES_FIXOS.id, { name: 'Cidade' }],
      ]);
    });
  });

  describe('grids', () => {
    it('"Duplicar" copies the grid and picks the copy', async () => {
      await openLibrary(deps);
      await openCatacumbas();
      const copy = { ...OSSUARIO, id: NEW_GRID.id, name: 'Ossuário (cópia)' };
      deps.libraryApi.answer('duplicateScene', { ok: true, value: copy });
      deps.libraryApi.answer('list', {
        ok: true,
        value: masterLibrary({ scenes: [...masterLibrary().scenes, copy] }),
      });
      await choose(treeItem('Ossuário'), 'Duplicar');
      expect(deps.libraryApi.callsOf('duplicateScene')).toEqual([[OSSUARIO.id]]);
      await waitFor(() =>
        expect(treeItem('Ossuário (cópia)')).toHaveAttribute('aria-selected', 'true'),
      );
    });

    it('"Excluir grid" asks first, with what goes with the grid, and only the button deletes', async () => {
      await openLibrary(deps);
      await openCatacumbas();
      await choose(treeItem('Ossuário'), 'Excluir grid');
      const confirm = screen.getByRole('alertdialog', { name: 'Excluir Ossuário?' });
      expect(confirm).toHaveTextContent('Some com 14 tokens, as paredes e as luzes.');
      await userEvent.click(within(confirm).getByRole('button', { name: 'Cancelar' }));
      expect(deps.libraryApi.callsOf('removeScene')).toEqual([]);
      await choose(treeItem('Ossuário'), 'Excluir grid');
      const again = screen.getByRole('alertdialog', { name: 'Excluir Ossuário?' });
      await userEvent.click(within(again).getByRole('button', { name: 'Excluir' }));
      await waitFor(() => expect(deps.libraryApi.callsOf('removeScene')).toEqual([[OSSUARIO.id]]));
    });

    it('on the group grid "Excluir grid" is disabled and says why', async () => {
      await openLibrary(deps);
      const menu = await openTreeMenu(treeItem(VHARN_SCENE.name));
      const remove = within(menu).getByRole('menuitem', { name: 'Excluir grid' });
      expect(remove).toHaveAttribute('aria-disabled', 'true');
      expect(remove).toHaveAccessibleDescription(
        'Leva o grupo pra outro grid antes de excluir este.',
      );
      expect(within(menu).getByRole('menuitem', { name: 'Duplicar' })).not.toHaveAttribute(
        'aria-disabled',
      );
    });
  });

  describe('folders', () => {
    it('"Mover para…" moves the folder, never into itself or a folder inside it', async () => {
      await openLibrary(deps);
      await choose(treeItem('Ato 1'), 'Mover para…');
      const move = screen.getByRole('dialog', { name: 'Mover Ato 1' });
      const picker = within(move).getByRole('combobox', { name: 'Para dentro de' });
      const options = within(picker)
        .getAllByRole('option')
        .map((option) => option.textContent);
      expect(options).toEqual(['Sem pasta', 'Lugares fixos']);
      await userEvent.selectOptions(picker, LUGARES_FIXOS.id);
      await userEvent.click(within(move).getByRole('button', { name: 'Mover' }));
      expect(deps.libraryApi.callsOf('updateFolder')).toEqual([
        [ATO_1.id, { parentId: LUGARES_FIXOS.id }],
      ]);
    });

    it('"Excluir pasta" asks first and says where the grids go', async () => {
      await openLibrary(deps);
      await userEvent.click(treeItem('Ato 1'));
      await choose(treeItem('Catacumbas'), 'Excluir pasta');
      const confirm = screen.getByRole('alertdialog', { name: 'Excluir a pasta Catacumbas?' });
      expect(confirm).toHaveTextContent(
        'Os grids, as imagens e as pastas de dentro vão para Ato 1. Nenhum item é apagado.',
      );
      await userEvent.click(within(confirm).getByRole('button', { name: 'Excluir' }));
      await waitFor(() =>
        expect(deps.libraryApi.callsOf('removeFolder')).toEqual([[CATACUMBAS.id]]),
      );
    });

    it('a root folder goes to "Sem pasta"', async () => {
      await openLibrary(deps);
      await choose(treeItem('Ato 1'), 'Excluir pasta');
      expect(screen.getByRole('alertdialog', { name: 'Excluir a pasta Ato 1?' })).toHaveTextContent(
        'Os grids, as imagens e as pastas de dentro vão para Sem pasta. Nenhum item é apagado.',
      );
    });

    it('a refusal of the move goes to the status line', async () => {
      await openLibrary(deps);
      deps.libraryApi.answer('updateFolder', { ok: false, failure: { kind: 'folder_cycle' } });
      await choose(treeItem('Ato 1'), 'Mover para…');
      await userEvent.selectOptions(
        screen.getByRole('combobox', { name: 'Para dentro de' }),
        LUGARES_FIXOS.id,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Mover' }));
      const library = screen.getByRole('dialog', { name: 'Biblioteca' });
      await waitFor(() =>
        expect(within(library).getByRole('status')).toHaveTextContent(
          'Uma pasta não entra nela mesma nem numa pasta de dentro dela.',
        ),
      );
    });
  });

  it('while reconnecting every item of every menu is disabled', async () => {
    await openLibrary(deps);
    deps.tableSessionApi.emit({ kind: 'status', status: 'reconnecting' });
    for (const target of [treeItem('Ato 1'), treeItem('Cena 1'), treeItem('Sem pasta')]) {
      const menu = await openTreeMenu(target);
      for (const item of within(menu).getAllByRole('menuitem')) {
        expect(item).toHaveAttribute('aria-disabled', 'true');
      }
      fireEvent.keyDown(menu, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    }
  });
});
