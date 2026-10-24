import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppShell } from '@/app/shell/app-shell';
import { COMPACT_RAIL_HANDLE } from '@/app/shell/rail-handle';
import { createOpenTablesStore, type OpenTablesStore } from '@/stores/open-tables-store';
import { RAIL_STORAGE_KEY, createRailStore, type RailStore } from '@/stores/rail-store';
import type { StoreApi } from 'zustand/vanilla';
import { ANA } from '../../support/auth-api-fake';
import { QUELM, VHARN } from '../../support/campaigns-api-fake';
import { VHARN_CAST_ID } from '../../support/cast-fixtures';
import { StorageFake } from '../../support/storage-fake';
import { tabInteractions } from '../../support/tab-interactions';
import { TableSessionApiFake } from '../../support/table-session-api-fake';
import { biaJoined, vharnState } from '../../support/table-session-fixtures';

describe('AppShell', () => {
  let railStorage: StorageFake;
  let railStore: StoreApi<RailStore>;
  let tableSessionApi: TableSessionApiFake;
  let openTables: StoreApi<OpenTablesStore>;

  beforeEach(() => {
    railStorage = new StorageFake();
    railStore = createRailStore(railStorage);
    tableSessionApi = new TableSessionApiFake();
    openTables = createOpenTablesStore({
      api: tableSessionApi,
      storage: new StorageFake(),
      createInteraction: tabInteractions(),
    });
  });

  function renderShellAt(path: string): ReturnType<typeof createMemoryRouter> {
    const shell = (): React.JSX.Element => (
      <AppShell
        railStore={railStore}
        openTables={openTables}
        user={ANA}
        onSignOut={async () => undefined}
      />
    );
    const router = createMemoryRouter(
      [
        {
          Component: shell,
          children: [
            { index: true, element: <h1>Conteúdo das mesas</h1> },
            { path: 'outra', element: <h1>Outra página</h1> },
            {
              path: 'campaigns/:campaignId/table',
              handle: COMPACT_RAIL_HANDLE,
              element: <h1>Tela da mesa</h1>,
            },
          ],
        },
      ],
      { initialEntries: [path] },
    );
    render(<RouterProvider router={router} />);
    return router;
  }

  function rail(): HTMLElement {
    return screen.getByRole('complementary', { name: 'Menu lateral' });
  }

  it('the "Mesas" link lives in the "Principal" nav and is the current page on /', async () => {
    renderShellAt('/');
    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByRole('link', { name: 'Mesas' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('on another page "Mesas" is not marked as current', async () => {
    renderShellAt('/outra');
    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByRole('link', { name: 'Mesas' })).not.toHaveAttribute('aria-current');
  });

  it('"Recolher menu" collapses the rail, turns into "Expandir menu" and stores collapsed', async () => {
    renderShellAt('/');
    const toggle = await screen.findByRole('button', { name: 'Recolher menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(toggle);
    const expand = screen.getByRole('button', { name: 'Expandir menu' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(railStore.getState().rail).toBe('collapsed');
  });

  it('collapsed, the link keeps the name "Mesas" and the brand is still announced', async () => {
    railStore.getState().toggle();
    renderShellAt('/');
    await screen.findByRole('button', { name: 'Expandir menu' });
    expect(within(rail()).getByRole('link', { name: 'Mesas' })).toBeInTheDocument();
    expect(within(rail()).getByRole('img', { name: 'LORKARIUM' })).toBeInTheDocument();
  });

  it('the content of the route shows inside main', async () => {
    renderShellAt('/');
    const main = await screen.findByRole('main');
    expect(within(main).getByRole('heading', { name: 'Conteúdo das mesas' })).toBeInTheDocument();
  });

  // Regression (2026-10-14): inside the tooltip trigger (asChild) the NavLink className function was
  // stringified by the Radix Slot, so the collapsed icon lost its centering classes.
  it('collapsed, the link keeps its own classes instead of a stringified function', async () => {
    railStore.getState().toggle();
    renderShellAt('/');
    await screen.findByRole('button', { name: 'Expandir menu' });
    const link = within(rail()).getByRole('link', { name: 'Mesas' });
    expect(link.className).not.toMatch(/=>|isActive/);
    expect(link.className.split(' ')).toContain('justify-center');
  });

  describe('compact rail on the play room', () => {
    it('at a table the names go sr-only, there is no toggle and the stored preference stays expanded', async () => {
      railStore.getState().toggle();
      railStore.getState().toggle();
      renderShellAt(`/campaigns/${VHARN.id}/table`);
      await screen.findByRole('heading', { name: 'Tela da mesa' });
      const mesas = within(rail()).getByRole('link', { name: 'Mesas' });
      expect(within(mesas).getByText('Mesas')).toHaveClass('sr-only');
      expect(within(rail()).queryByRole('button', { name: /menu$/ })).not.toBeInTheDocument();
      expect(railStorage.values.get(RAIL_STORAGE_KEY)).toBe('expanded');
    });

    it('going back to / shows the rail expanded as it was', async () => {
      const router = renderShellAt(`/campaigns/${VHARN.id}/table`);
      await screen.findByRole('heading', { name: 'Tela da mesa' });
      await act(() => router.navigate('/'));
      expect(await screen.findByRole('button', { name: 'Recolher menu' })).toBeInTheDocument();
      expect(within(rail()).getByText('Mesas')).not.toHaveClass('sr-only');
    });

    it('with the preference collapsed, the table keeps the rail collapsed and the preference', async () => {
      railStore.getState().toggle();
      renderShellAt(`/campaigns/${VHARN.id}/table`);
      await screen.findByRole('heading', { name: 'Tela da mesa' });
      expect(within(rail()).getByText('Mesas')).toHaveClass('sr-only');
      expect(railStore.getState().rail).toBe('collapsed');
    });
  });

  describe('open tables', () => {
    function openVharnAndQuelm(): void {
      openTables
        .getState()
        .open({ campaignId: VHARN.id, name: 'Vharn', castSceneId: VHARN_CAST_ID });
      openTables
        .getState()
        .open({ campaignId: QUELM.id, name: 'Quelm', castSceneId: VHARN_CAST_ID });
    }

    function openTablesNav(): HTMLElement {
      return within(rail()).getByRole('navigation', { name: 'Mesas abertas' });
    }

    function tableLink(name: RegExp): HTMLElement {
      return within(openTablesNav()).getByRole('link', { name });
    }

    it('with no table open there is no "Mesas abertas" nav', async () => {
      renderShellAt('/');
      await screen.findByRole('navigation', { name: 'Principal' });
      expect(screen.queryByRole('navigation', { name: 'Mesas abertas' })).not.toBeInTheDocument();
    });

    it('VHARN and QUELM open are listed in the order they were opened, linking to their tables', async () => {
      openVharnAndQuelm();
      renderShellAt('/');
      await screen.findByRole('navigation', { name: 'Principal' });
      const links = within(openTablesNav()).getAllByRole('link');
      expect(links.map((link) => link.getAttribute('href'))).toEqual([
        `/campaigns/${VHARN.id}/table`,
        `/campaigns/${QUELM.id}/table`,
      ]);
      expect(links[0]).toHaveTextContent('Vharn');
    });

    it('the VHARN link counts who is online from the snapshot and follows memberJoined', async () => {
      openVharnAndQuelm();
      renderShellAt('/');
      await screen.findByRole('navigation', { name: 'Principal' });
      tableSessionApi.emitTo(
        VHARN.id,
        { kind: 'state', state: vharnState() },
        { kind: 'status', status: 'live' },
      );
      expect(tableLink(/Vharn/)).toHaveTextContent('2 online');
      tableSessionApi.emitTo(VHARN.id, { kind: 'memberJoined', event: biaJoined() });
      expect(tableLink(/Vharn/)).toHaveTextContent('3 online');
    });

    it.each([
      ['connecting', 'conectando…', { kind: 'status', status: 'connecting' }],
      ['reconnecting', 'conectando…', { kind: 'status', status: 'reconnecting' }],
      ['failed', 'indisponível', { kind: 'failed', failure: 'not_found' }],
    ] as const)('a table %s reads "%s"', async (_, label, update) => {
      openVharnAndQuelm();
      renderShellAt('/');
      await screen.findByRole('navigation', { name: 'Principal' });
      tableSessionApi.emitTo(VHARN.id, update);
      expect(tableLink(/Vharn/)).toHaveTextContent(label);
    });

    it('at the VHARN table its link is the current page and the QUELM one is not', async () => {
      openVharnAndQuelm();
      renderShellAt(`/campaigns/${VHARN.id}/table`);
      await screen.findByRole('heading', { name: 'Tela da mesa' });
      expect(tableLink(/Vharn/)).toHaveAttribute('aria-current', 'page');
      expect(tableLink(/Quelm/)).not.toHaveAttribute('aria-current');
    });

    it('collapsed, the link keeps the name of the table and the tooltip reads "Vharn · 2 online"', async () => {
      openVharnAndQuelm();
      railStore.getState().toggle();
      renderShellAt('/');
      await screen.findByRole('button', { name: 'Expandir menu' });
      tableSessionApi.emitTo(
        VHARN.id,
        { kind: 'state', state: vharnState() },
        { kind: 'status', status: 'live' },
      );
      await userEvent.hover(tableLink(/Vharn/));
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Vharn · 2 online');
    });

    it('right-clicking QUELM offers "Sair da mesa", which closes QUELM and keeps the person at VHARN', async () => {
      openVharnAndQuelm();
      renderShellAt(`/campaigns/${VHARN.id}/table`);
      await screen.findByRole('heading', { name: 'Tela da mesa' });
      fireEvent.contextMenu(tableLink(/Quelm/));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Sair da mesa' }));
      expect(tableSessionApi.closedIds).toEqual([QUELM.id]);
      expect(
        within(openTablesNav()).queryByRole('link', { name: /Quelm/ }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Tela da mesa' })).toBeInTheDocument();
    });

    it('Esc closes the context menu without closing the table and gives the focus back to the link', async () => {
      openVharnAndQuelm();
      renderShellAt('/');
      await screen.findByRole('navigation', { name: 'Principal' });
      tableLink(/Quelm/).focus();
      fireEvent.contextMenu(tableLink(/Quelm/));
      await screen.findByRole('menu');
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
      expect(tableSessionApi.closedIds).toEqual([]);
      expect(tableLink(/Quelm/)).toHaveFocus();
    });
  });
});
