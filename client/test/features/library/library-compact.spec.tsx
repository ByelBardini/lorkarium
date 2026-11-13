import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ROOM_LIBRARY_WIDTH_STORAGE_KEY } from '@/stores/room-layout-store';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { VHARN } from '../../support/campaigns-api-fake';
import { OSSUARIO } from '../../support/library-fixtures';
import { openLibrary } from '../../support/library-harness';
import { openCatacumbas, treeItem } from '../../support/library-tree';

const LIBRARY_PATH = `/campaigns/${VHARN.id}/table/library`;

describe('the library drawer, narrow and wide', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
  });

  function drawer(): HTMLElement {
    return screen.getByRole('complementary', { name: 'Biblioteca' });
  }

  const gridPanel = (): HTMLElement | null =>
    within(drawer()).queryByRole('region', { name: 'Grid escolhido' });

  const tree = (): HTMLElement | null =>
    within(drawer()).queryByRole('tree', { name: 'Itens e pastas' });

  describe('narrow (under 720 px)', () => {
    it('shows only the tree: a grid clicked is picked there, with no panel and no "Voltar"', async () => {
      await openLibrary(deps, { libraryWidth: 420 });
      await openCatacumbas();
      await userEvent.click(treeItem('Ossuário'));
      expect(treeItem('Ossuário')).toHaveAttribute('aria-selected', 'true');
      expect(tree()).toBeInTheDocument();
      expect(gridPanel()).toBeNull();
      expect(within(drawer()).queryByRole('button', { name: 'Voltar' })).toBeNull();
    });

    it('a double click on a grid opens its tab behind the drawer, which stays open', async () => {
      const { router, table } = await openLibrary(deps, { libraryWidth: 420 });
      await openCatacumbas();
      await userEvent.dblClick(treeItem('Ossuário'));
      expect(table.tabs.getState().visibleKey).toBe(OSSUARIO.id);
      expect(router.state.location.pathname).toBe(LIBRARY_PATH);
      expect(drawer()).toBeInTheDocument();
    });

    it('Enter on a grid opens its tab as the double click does; Space only picks it', async () => {
      const { table } = await openLibrary(deps, { libraryWidth: 420 });
      await openCatacumbas();
      treeItem('Ossuário').focus();
      await userEvent.keyboard(' ');
      expect(treeItem('Ossuário')).toHaveAttribute('aria-selected', 'true');
      expect(table.tabs.getState().visibleKey).not.toBe(OSSUARIO.id);
      await userEvent.keyboard('{Enter}');
      expect(table.tabs.getState().visibleKey).toBe(OSSUARIO.id);
    });

    it('a double click on a folder opens no tab', async () => {
      const { table } = await openLibrary(deps, { libraryWidth: 420 });
      const before = table.tabs.getState().visibleKey;
      await userEvent.dblClick(treeItem('Ato 1'));
      expect(table.tabs.getState().visibleKey).toBe(before);
    });

    it('"Ampliar biblioteca" widens and remembers it, showing the panel of the grid picked', async () => {
      await openLibrary(deps, { libraryWidth: 420 });
      await openCatacumbas();
      await userEvent.click(treeItem('Ossuário'));
      await userEvent.click(within(drawer()).getByRole('button', { name: 'Ampliar biblioteca' }));
      expect(deps.roomLayoutStorage.values.get(ROOM_LIBRARY_WIDTH_STORAGE_KEY)).toBe('960');
      expect(tree()).toBeInTheDocument();
      expect(gridPanel()).toBeInTheDocument();
    });
  });

  describe('wide (720 px on)', () => {
    it('shows the tree and the panel of the grid picked side by side', async () => {
      await openLibrary(deps, { libraryWidth: 960 });
      await openCatacumbas();
      await userEvent.click(treeItem('Ossuário'));
      expect(tree()).toBeInTheDocument();
      expect(within(gridPanel() ?? drawer()).getByRole('textbox', { name: 'Nome' })).toHaveValue(
        'Ossuário',
      );
    });

    it('"Reduzir biblioteca" goes back to the narrow width, and the panel goes away', async () => {
      await openLibrary(deps, { libraryWidth: 960 });
      await openCatacumbas();
      await userEvent.click(treeItem('Ossuário'));
      await userEvent.click(within(drawer()).getByRole('button', { name: 'Reduzir biblioteca' }));
      expect(deps.roomLayoutStorage.values.get(ROOM_LIBRARY_WIDTH_STORAGE_KEY)).toBe('420');
      await waitFor(() => expect(gridPanel()).toBeNull());
      expect(treeItem('Ossuário')).toHaveAttribute('aria-selected', 'true');
    });
  });
});
