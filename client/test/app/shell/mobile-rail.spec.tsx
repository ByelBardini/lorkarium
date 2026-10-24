import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { MobileRail } from '@/app/shell/mobile-rail';
import { createOpenTablesStore, type OpenTablesStore } from '@/stores/open-tables-store';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { VHARN_CAST_ID } from '../../support/cast-fixtures';
import { StorageFake } from '../../support/storage-fake';
import { tabInteractions } from '../../support/tab-interactions';
import { TableSessionApiFake } from '../../support/table-session-api-fake';

describe('MobileRail', () => {
  let openTables: StoreApi<OpenTablesStore>;
  let router: ReturnType<typeof createMemoryRouter>;

  beforeEach(() => {
    openTables = createOpenTablesStore({
      api: new TableSessionApiFake(),
      storage: new StorageFake(),
      createInteraction: tabInteractions(),
    });
  });

  function renderDrawer(): void {
    const drawer = (): React.JSX.Element => (
      <MobileRail openTables={openTables} user={ANA} onSignOut={async () => undefined} />
    );
    router = createMemoryRouter([{ path: '*', Component: drawer }]);
    render(<RouterProvider router={router} />);
  }

  it('"Abrir menu" opens a dialog with the "Mesas" link', async () => {
    renderDrawer();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByRole('link', { name: 'Mesas' })).toBeInTheDocument();
  });

  it('choosing the link closes the drawer', async () => {
    renderDrawer();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('link', { name: 'Mesas' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('the drawer lists the open tables, and choosing one closes it and goes to that table', async () => {
    openTables.getState().open({ campaignId: VHARN.id, name: 'Vharn', castSceneId: VHARN_CAST_ID });
    renderDrawer();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    const nav = within(await screen.findByRole('dialog')).getByRole('navigation', {
      name: 'Mesas abertas',
    });
    await userEvent.click(within(nav).getByRole('link', { name: /Vharn/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe(`/campaigns/${VHARN.id}/table`);
  });
});
