import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { VHARN } from '../../support/campaigns-api-fake';
import { openLibrary, openRoom } from '../../support/library-harness';
import {
  CATACUMBAS,
  LUGARES_FIXOS,
  OSSUARIO,
  libraryScene,
  masterLibrary,
  playerLibrary,
} from '../../support/library-fixtures';
import { libraryTree, openCatacumbas, treeItem, treeItemNames } from '../../support/library-tree';
import { libraryChanged } from '../../support/scene-tab-fixtures';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  VHARN_SCENE,
  vharnState,
} from '../../support/table-session-fixtures';

const LIBRARY_PATH = `/campaigns/${VHARN.id}/table/library`;

describe('the library of grids', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
  });

  function library(): HTMLElement {
    return screen.getByRole('dialog', { name: 'Biblioteca de grids' });
  }

  function panel(): HTMLElement {
    return screen.getByRole('region', { name: 'Grid escolhido' });
  }

  it('"Biblioteca" opens the library over the room, which stays mounted', async () => {
    const { router } = await openLibrary(deps);
    expect(router.state.location.pathname).toBe(LIBRARY_PATH);
    expect(library()).toBeInTheDocument();
    expect(screen.getByRole('application', { hidden: true })).toBeInTheDocument();
    expect(deps.libraryApi.callsOf('list')).toHaveLength(1);
    expect(deps.libraryApi.calls[0]?.args[0]).toBe(VHARN.id);
    expect(deps.openTables.getState().tables).toHaveLength(1);
  });

  it('shows a status while the list loads, then the tree', async () => {
    const release = deps.libraryApi.hold('list');
    await openRoom(deps);
    await userEvent.click(screen.getByRole('link', { name: 'Biblioteca' }));
    const dialog = await screen.findByRole('dialog', { name: 'Biblioteca de grids' });
    expect(within(dialog).getByRole('status')).toHaveTextContent('Carregando a biblioteca…');
    release({ ok: true, value: masterLibrary() });
    expect(await screen.findByRole('tree', { name: 'Grids e pastas' })).toBeInTheDocument();
  });

  it('the tree has the root folders and "Sem pasta" open with its grid, with their counts', async () => {
    await openLibrary(deps);
    expect(treeItemNames()).toEqual(['Ato 1', 'Lugares fixos', 'Sem pasta', 'Cena 1']);
    expect(treeItem('Ato 1')).toHaveAccessibleDescription('3 grids');
    expect(treeItem('Ato 1')).toHaveAttribute('aria-expanded', 'false');
    expect(treeItem('Lugares fixos')).not.toHaveAttribute('aria-expanded');
    expect(treeItem('Sem pasta')).toHaveAccessibleDescription('1 grid · o grupo está aqui');
    expect(treeItem('Cena 1')).toHaveAttribute('aria-level', '2');
    expect(treeItem('Cena 1')).not.toHaveAttribute('aria-expanded');
    expect(screen.queryByRole('treeitem', { name: 'Todos os grids' })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Grids' })).toBeNull();
  });

  it('the grids are items inside their folders, and close with them', async () => {
    await openLibrary(deps);
    await userEvent.click(treeItem('Ato 1'));
    expect(treeItemNames()).toEqual([
      'Ato 1',
      'Catacumbas',
      'Estrada de Vharn',
      'Lugares fixos',
      'Sem pasta',
      'Cena 1',
    ]);
    await userEvent.click(treeItem('Catacumbas'));
    expect(treeItem('Ossuário')).toHaveAttribute('aria-level', '3');
    await userEvent.click(treeItem('Ato 1'));
    expect(treeItemNames()).toEqual(['Ato 1', 'Lugares fixos', 'Sem pasta', 'Cena 1']);
  });

  it('a folder holding the group grid, even deep inside, says the group is there', async () => {
    deps.libraryApi.answer('list', {
      ok: true,
      value: masterLibrary({ activeSceneId: OSSUARIO.id }),
    });
    await openLibrary(deps);
    expect(treeItem('Ato 1')).toHaveAccessibleDescription('3 grids · o grupo está aqui');
    await openCatacumbas();
    expect(treeItem('Ossuário')).toHaveAccessibleDescription(/ · No ar/);
  });

  it('right arrow opens a folder and enters it, Enter picks, left goes up and closes', async () => {
    await openLibrary(deps);
    treeItem('Ato 1').focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(treeItem('Ato 1')).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{ArrowRight}');
    expect(treeItem('Catacumbas')).toHaveFocus();
    expect(treeItem('Catacumbas')).toHaveAttribute('aria-level', '2');
    await userEvent.keyboard('{Enter}');
    expect(treeItem('Catacumbas')).toHaveAttribute('aria-selected', 'true');
    expect(treeItem('Catacumbas')).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(treeItem('Ossuário')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(treeItem('Ossuário')).toHaveAttribute('aria-selected', 'true');
    expect(within(panel()).getByRole('textbox', { name: 'Nome' })).toHaveValue('Ossuário');
    await userEvent.keyboard('{ArrowLeft}');
    expect(treeItem('Catacumbas')).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(treeItem('Ato 1')).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(treeItem('Ato 1')).toHaveAttribute('aria-expanded', 'false');
  });

  it('down and up arrows walk the folders and the grids that show', async () => {
    await openLibrary(deps);
    treeItem('Lugares fixos').focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(treeItem('Cena 1')).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(treeItem('Ato 1')).toHaveFocus();
    await userEvent.keyboard('{End}{ArrowUp}');
    expect(treeItem('Sem pasta')).toHaveFocus();
  });

  it('clicking a grid picks it and shows it in the panel', async () => {
    await openLibrary(deps);
    expect(panel()).toHaveTextContent('Nenhum grid escolhido');
    await userEvent.click(treeItem('Cena 1'));
    expect(treeItem('Cena 1')).toHaveAttribute('aria-selected', 'true');
    expect(within(panel()).getByRole('textbox', { name: 'Nome' })).toHaveValue('Cena 1');
    expect(panel()).toHaveTextContent('20×12');
  });

  it('a grid item says its visibility, size, tokens and where the group is', async () => {
    await openLibrary(deps, {
      state: vharnState({
        members: [ANA_AT_TABLE, { ...BIA_AT_TABLE, online: true }, CAIO_AT_TABLE],
      }),
    });
    expect(treeItem('Cena 1')).toHaveAccessibleDescription(
      /^Público · 20×12 casas · 2 tokens · editado .+ · No ar · 2 jogadores aqui$/,
    );
    await openCatacumbas();
    expect(treeItem('Ossuário')).toHaveAccessibleDescription(/^Privado · 28×28 casas · 14 tokens/);
  });

  it('the panel shows the background of the grid picked', async () => {
    await openLibrary(deps);
    await userEvent.click(treeItem('Ato 1'));
    await userEvent.click(treeItem('Estrada de Vharn'));
    expect(within(panel()).getByRole('img', { name: 'Estrada de Vharn' })).toHaveAttribute(
      'src',
      '/api/assets/7c6b5a49-3827-4615-a5f4-e3d2c1b0a9f8',
    );
  });

  it('searching keeps the grids that match and opens the folders above them', async () => {
    await openLibrary(deps);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar grid' }), 'ossuario');
    expect(treeItemNames()).toEqual(['Ato 1', 'Catacumbas', 'Ossuário']);
    expect(treeItem('Ato 1')).toHaveAttribute('aria-expanded', 'true');
    expect(treeItem('Ato 1')).toHaveAccessibleDescription('1 grid');
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Buscar grid' }));
    expect(treeItemNames()).toContain('Lugares fixos');
    expect(treeItemNames()).toContain('Cena 1');
  });

  it('"Privados" keeps only the private grids, and an empty result says so', async () => {
    await openLibrary(deps);
    await userEvent.click(screen.getByRole('radio', { name: 'Privados' }));
    expect(treeItemNames()).toEqual(['Ato 1', 'Catacumbas', 'Torre', 'Ossuário']);
    expect(within(library()).queryByText('Nada por aqui com esse filtro.')).toBeNull();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar grid' }), 'cena');
    expect(treeItemNames()).toEqual([]);
    expect(within(library()).getByText('Nada por aqui com esse filtro.')).toBeInTheDocument();
  });

  it('a network error offers "Tentar de novo", which reads the list again', async () => {
    deps.libraryApi.answer('list', { ok: false, failure: { kind: 'offline' } });
    await openRoom(deps);
    await userEvent.click(screen.getByRole('link', { name: 'Biblioteca' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão com o servidor.');
    deps.libraryApi.answer('list', { ok: true, value: masterLibrary() });
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('tree', { name: 'Grids e pastas' })).toBeInTheDocument();
    expect(deps.libraryApi.callsOf('list')).toHaveLength(2);
  });

  it('Esc closes the library and goes back to the room', async () => {
    const { router } = await openLibrary(deps);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.location.pathname).toBe(`/campaigns/${VHARN.id}/table`);
    expect(screen.getByRole('application')).toBeInTheDocument();
  });

  it('"Fechar biblioteca" closes it too', async () => {
    const { router } = await openLibrary(deps);
    await userEvent.click(screen.getByRole('button', { name: 'Fechar biblioteca' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/campaigns/${VHARN.id}/table`),
    );
  });

  it('a library:changed reads the list again', async () => {
    await openLibrary(deps);
    const lago = libraryScene({ ...OSSUARIO, id: LUGARES_FIXOS.id, name: 'Lago' });
    deps.libraryApi.answer('list', {
      ok: true,
      value: masterLibrary({ scenes: [...masterLibrary().scenes, lago] }),
    });
    deps.tableSessionApi.emit({ kind: 'libraryChanged', event: libraryChanged() });
    expect(await within(libraryTree()).findByRole('treeitem', { name: 'Lago' })).toBeVisible();
    expect(deps.libraryApi.callsOf('list')).toHaveLength(2);
  });

  describe('as a player', () => {
    it('shows what the server lets the player see, without the visibility filter', async () => {
      deps.libraryApi.answer('list', { ok: true, value: playerLibrary() });
      await openLibrary(deps, { role: 'player' });
      await userEvent.click(treeItem('Ato 1'));
      expect(treeItemNames()).toEqual(['Ato 1', 'Estrada de Vharn', 'Sem pasta', 'Cena 1']);
      expect(screen.queryByRole('radiogroup', { name: 'Visibilidade' })).toBeNull();
      expect(treeItem('Estrada de Vharn')).toHaveAccessibleDescription(
        /^Público · 30×20 casas · editado/,
      );
    });

    it('has no context menu and no "Nova pasta"', async () => {
      deps.libraryApi.answer('list', { ok: true, value: playerLibrary() });
      await openLibrary(deps, { role: 'player' });
      fireEvent.contextMenu(treeItem('Ato 1'));
      fireEvent.contextMenu(treeItem('Cena 1'));
      expect(screen.queryByRole('menu')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Nova pasta' })).toBeNull();
    });

    it('with only the group grid it says the master has opened nothing yet', async () => {
      const group = libraryScene(VHARN_SCENE, { tokenCount: null });
      deps.libraryApi.answer('list', {
        ok: true,
        value: playerLibrary({ folders: [], scenes: [group] }),
      });
      await openLibrary(deps, { role: 'player' });
      expect(
        within(library()).getByText('O mestre ainda não abriu nenhum lugar.'),
      ).toBeInTheDocument();
      expect(treeItemNames()).toEqual(['Sem pasta', 'Cena 1']);
      expect(within(libraryTree()).queryByRole('treeitem', { name: CATACUMBAS.name })).toBeNull();
    });
  });
});
