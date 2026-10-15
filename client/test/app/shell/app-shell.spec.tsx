import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppShell } from '@/app/shell/app-shell';
import { createRailStore, type RailStore } from '@/stores/rail-store';
import type { StoreApi } from 'zustand/vanilla';
import { ANA } from '../../support/auth-api-fake';
import { StorageFake } from '../../support/storage-fake';

describe('AppShell', () => {
  let railStore: StoreApi<RailStore>;

  beforeEach(() => {
    railStore = createRailStore(new StorageFake());
  });

  function renderShellAt(path: string): void {
    const shell = (): React.JSX.Element => (
      <AppShell railStore={railStore} user={ANA} onSignOut={async () => undefined} />
    );
    const router = createMemoryRouter(
      [
        {
          Component: shell,
          children: [
            { index: true, element: <h1>Conteúdo das mesas</h1> },
            { path: 'outra', element: <h1>Outra página</h1> },
          ],
        },
      ],
      { initialEntries: [path] },
    );
    render(<RouterProvider router={router} />);
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
});
