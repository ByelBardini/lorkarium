import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { VHARN } from '../../support/campaigns-api-fake';
import { NEW_FOLDER, NEW_GRID } from '../../support/library-api-fake';
import { ATO_1, OSSUARIO, masterLibrary, playerLibrary } from '../../support/library-fixtures';
import { openLibrary } from '../../support/library-harness';
import { openCatacumbas, treeItem } from '../../support/library-tree';
import { VHARN_SCENE } from '../../support/table-session-fixtures';

describe('the actions of the library', () => {
  it('the create dropdown offers grid, image and folder and starts a folder field', async () => {
    await openLibrary(testDependencies());
    await userEvent.click(screen.getByRole('button', { name: 'Criar item' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Novo grid',
      'Novo documento',
      'Novo modelo de ficha',
      'Importar modelo de ficha',
      'Nova ficha',
      'Nova imagem',
      'Nova pasta',
    ]);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Nova pasta' }));
    expect(screen.getByRole('textbox', { name: 'Nome da nova pasta' })).toHaveFocus();
  });
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
  });

  function library(): HTMLElement {
    return screen.getByRole('dialog', { name: 'Biblioteca' });
  }

  function panel(): HTMLElement {
    return screen.getByRole('region', { name: 'Grid escolhido' });
  }

  async function pickOssuario(): Promise<void> {
    await openCatacumbas();
    await userEvent.click(treeItem('Ossuário'));
  }

  function statusLine(): HTMLElement {
    return within(library()).getByRole('status');
  }

  function withScene(...extra: (typeof OSSUARIO)[]) {
    return masterLibrary({ scenes: [...masterLibrary().scenes, ...extra] });
  }

  function withFolderIn(parentId: string | null) {
    return masterLibrary({ folders: [...masterLibrary().folders, { ...NEW_FOLDER, parentId }] });
  }

  describe('grids', () => {
    it('header creation ignores the selected folder, creates at root and focuses its name', async () => {
      await openLibrary(deps);
      await userEvent.click(treeItem('Ato 1'));
      await userEvent.click(treeItem('Ato 1'));
      deps.libraryApi.answer('list', {
        ok: true,
        value: withScene({ ...NEW_GRID, folderId: null }),
      });
      await userEvent.click(screen.getByRole('button', { name: 'Criar item' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Novo grid' }));
      expect(deps.libraryApi.callsOf('createScene')).toEqual([[{ folderId: null }]]);
      const name = await within(panel()).findByRole('textbox', { name: 'Nome' });
      expect(name).toHaveValue('Grid sem nome');
      expect(name).toHaveFocus();
      expect(treeItem('Grid sem nome')).toHaveAttribute('aria-selected', 'true');
      expect(treeItem('Ato 1')).toHaveAttribute('aria-expanded', 'false');
    });

    it('header creation with a grid selected still creates at root', async () => {
      await openLibrary(deps);
      await pickOssuario();
      await userEvent.click(screen.getByRole('button', { name: 'Criar item' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Novo grid' }));
      expect(deps.libraryApi.callsOf('createScene')).toEqual([[{ folderId: null }]]);
    });

    it('the name goes on Enter and on leaving the field, only when it changed; Esc undoes', async () => {
      await openLibrary(deps);
      await pickOssuario();
      const name = within(panel()).getByRole('textbox', { name: 'Nome' });
      await userEvent.click(name);
      await userEvent.tab();
      expect(deps.libraryApi.callsOf('updateScene')).toEqual([]);
      await userEvent.clear(name);
      await userEvent.type(name, 'Ossário velho{Escape}');
      expect(name).toHaveValue('Ossuário');
      expect(deps.libraryApi.callsOf('updateScene')).toEqual([]);
      await userEvent.clear(name);
      await userEvent.type(name, 'Ossário velho{Enter}');
      await userEvent.clear(name);
      await userEvent.type(name, 'Cripta');
      await userEvent.tab();
      expect(deps.libraryApi.callsOf('updateScene')).toEqual([
        [OSSUARIO.id, { name: 'Ossário velho' }],
        [OSSUARIO.id, { name: 'Cripta' }],
      ]);
    });

    it('the panel has no folder picker: the grid moves by dragging it in the tree', async () => {
      await openLibrary(deps);
      await pickOssuario();
      expect(within(panel()).queryByRole('combobox', { name: 'Pasta' })).not.toBeInTheDocument();
    });

    it('"Público" publishes a private grid, which warns how taking the group there works', async () => {
      await openLibrary(deps);
      await pickOssuario();
      const who = within(panel()).getByRole('radiogroup', { name: 'Quem vê na biblioteca' });
      expect(within(who).getByRole('radio', { name: 'Privado' })).toBeChecked();
      expect(panel()).toHaveTextContent('Levar o grupo mostra o mapa pra quem estiver lá');
      await userEvent.click(within(who).getByRole('radio', { name: 'Público' }));
      expect(deps.libraryApi.callsOf('updateScene')).toEqual([
        [OSSUARIO.id, { visibility: 'public' }],
      ]);
      await userEvent.click(treeItem('Cena 1'));
      expect(panel()).not.toHaveTextContent('Levar o grupo mostra o mapa');
    });

    it('"Levar o grupo pra cá" activates the grid; on the group grid it reads "O grupo está aqui"', async () => {
      await openLibrary(deps);
      await pickOssuario();
      await userEvent.click(within(panel()).getByRole('button', { name: 'Levar o grupo pra cá' }));
      expect(deps.sceneActivation.activated).toEqual([
        { campaignId: VHARN.id, sceneId: OSSUARIO.id },
      ]);
      await userEvent.click(treeItem('Cena 1'));
      expect(within(panel()).getByRole('button', { name: 'O grupo está aqui' })).toBeDisabled();
    });

    it('"Abrir pra preparar" opens the grid in a tab of the room and closes the library', async () => {
      const { router, table } = await openLibrary(deps);
      await pickOssuario();
      await userEvent.click(within(panel()).getByRole('button', { name: 'Abrir pra preparar' }));
      await waitFor(() =>
        expect(router.state.location.pathname).toBe(`/campaigns/${VHARN.id}/table`),
      );
      expect(table.tabs.getState().visibleKey).toBe(OSSUARIO.id);
      expect(deps.tableSessionApi.watched).toContain(`${VHARN.id}:${OSSUARIO.id}`);
    });

    it('"Duplicar" of the panel copies the grid and picks the copy', async () => {
      await openLibrary(deps);
      await pickOssuario();
      const copy = { ...OSSUARIO, id: NEW_GRID.id, name: 'Ossuário (cópia)' };
      deps.libraryApi.answer('duplicateScene', { ok: true, value: copy });
      deps.libraryApi.answer('list', { ok: true, value: withScene(copy) });
      await userEvent.click(within(panel()).getByRole('button', { name: 'Duplicar' }));
      expect(deps.libraryApi.callsOf('duplicateScene')).toEqual([[OSSUARIO.id]]);
      await waitFor(() =>
        expect(within(panel()).getByRole('textbox', { name: 'Nome' })).toHaveValue(
          'Ossuário (cópia)',
        ),
      );
      expect(treeItem('Ossuário (cópia)')).toHaveAttribute('aria-selected', 'true');
    });

    it('"Excluir" of the panel asks first, with what goes with the grid', async () => {
      await openLibrary(deps);
      await pickOssuario();
      await userEvent.click(within(panel()).getByRole('button', { name: 'Excluir' }));
      const confirm = screen.getByRole('alertdialog', { name: 'Excluir Ossuário?' });
      expect(confirm).toHaveTextContent('Some com 14 tokens, as paredes e as luzes.');
      await userEvent.click(within(confirm).getByRole('button', { name: 'Excluir' }));
      await waitFor(() => expect(deps.libraryApi.callsOf('removeScene')).toEqual([[OSSUARIO.id]]));
    });

    it('the group grid cannot be deleted from the panel, and says why', async () => {
      await openLibrary(deps);
      await userEvent.click(treeItem('Cena 1'));
      expect(within(panel()).getByRole('button', { name: 'Excluir' })).toBeDisabled();
      expect(panel()).toHaveTextContent('Leva o grupo pra outro grid antes de excluir este.');
    });
  });

  describe('folders from the header', () => {
    it('"Nova pasta" creates on Enter inside the folder picked; Esc cancels', async () => {
      await openLibrary(deps);
      await userEvent.click(screen.getByRole('button', { name: 'Nova pasta' }));
      await userEvent.type(
        screen.getByRole('textbox', { name: 'Nome da nova pasta' }),
        'Rascunho{Escape}',
      );
      expect(screen.queryByRole('textbox', { name: 'Nome da nova pasta' })).toBeNull();
      expect(deps.libraryApi.callsOf('createFolder')).toEqual([]);
      await userEvent.click(treeItem('Ato 1'));
      deps.libraryApi.answer('list', { ok: true, value: withFolderIn(ATO_1.id) });
      await userEvent.click(screen.getByRole('button', { name: 'Nova pasta' }));
      await userEvent.type(
        screen.getByRole('textbox', { name: 'Nome da nova pasta' }),
        'Masmorra{Enter}',
      );
      expect(deps.libraryApi.callsOf('createFolder')).toEqual([
        [{ name: 'Masmorra', parentId: ATO_1.id }],
      ]);
      expect(await screen.findByRole('treeitem', { name: 'Masmorra' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    // Regression (e2e library.spec): the new subfolder opened inside a collapsed Ato 1 and the
    // tree hid the folder on screen.
    it('a folder created inside a collapsed one shows in the tree, its parents expanded', async () => {
      await openLibrary(deps);
      await userEvent.click(treeItem('Ato 1'));
      await userEvent.click(treeItem('Ato 1'));
      expect(treeItem('Ato 1')).toHaveAttribute('aria-expanded', 'false');
      deps.libraryApi.answer('list', { ok: true, value: withFolderIn(ATO_1.id) });
      await userEvent.click(screen.getByRole('button', { name: 'Nova pasta' }));
      await userEvent.type(
        screen.getByRole('textbox', { name: 'Nome da nova pasta' }),
        'Masmorra{Enter}',
      );
      const created = await screen.findByRole('treeitem', { name: 'Masmorra' });
      expect(created).toHaveAttribute('aria-selected', 'true');
      expect(treeItem('Ato 1')).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('refusals and connection', () => {
    it('SCENE_IS_ACTIVE and offline go to the status line', async () => {
      await openLibrary(deps);
      await pickOssuario();
      deps.libraryApi.answer('removeScene', { ok: false, failure: { kind: 'scene_is_active' } });
      await userEvent.click(within(panel()).getByRole('button', { name: 'Excluir' }));
      await userEvent.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
      );
      await waitFor(() => expect(statusLine()).toHaveTextContent('O grupo está nesse grid.'));
      deps.libraryApi.answer('duplicateScene', { ok: false, failure: { kind: 'offline' } });
      await userEvent.click(within(panel()).getByRole('button', { name: 'Duplicar' }));
      await waitFor(() => expect(statusLine()).toHaveTextContent('Sem conexão com o servidor.'));
    });

    it('while reconnecting the header and the panel are disabled', async () => {
      await openLibrary(deps);
      await pickOssuario();
      deps.tableSessionApi.emit({ kind: 'status', status: 'reconnecting' });
      expect(screen.getByRole('button', { name: 'Criar item' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Nova pasta' })).toBeDisabled();
      expect(within(panel()).getByRole('textbox', { name: 'Nome' })).toBeDisabled();
      expect(within(panel()).getByRole('button', { name: 'Levar o grupo pra cá' })).toBeDisabled();
      expect(within(panel()).getByRole('button', { name: 'Duplicar' })).toBeDisabled();
      expect(within(panel()).getByRole('button', { name: 'Excluir' })).toBeDisabled();
    });
  });

  describe('as a player or a spectator', () => {
    // A spectator reads the library as a player does (plan 2026-10-24-espectadores).
    it.each(['player', 'spectator'] as const)(
      'a %s only reads: no "Novo grid", no "Nova pasta", and the panel only opens',
      async (role) => {
        deps.libraryApi.answer('list', { ok: true, value: playerLibrary() });
        const { table } = await openLibrary(deps, { role });
        expect(screen.queryByRole('button', { name: 'Novo grid' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Nova pasta' })).toBeNull();
        await userEvent.click(treeItem('Ato 1'));
        await userEvent.click(treeItem('Estrada de Vharn'));
        expect(within(panel()).queryByRole('textbox')).toBeNull();
        expect(
          within(panel())
            .getAllByRole('button')
            .map((button) => button.textContent),
        ).toEqual(['Abrir']);
        fireEvent.contextMenu(treeItem('Estrada de Vharn'));
        expect(screen.queryByRole('menu')).toBeNull();
        await userEvent.click(within(panel()).getByRole('button', { name: 'Abrir' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(table.tabs.getState().tabs.map(({ key }) => key)).toContain(
          playerLibrary().scenes.find(({ id }) => id !== VHARN_SCENE.id)?.id,
        );
      },
    );
  });
});
