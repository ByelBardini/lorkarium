import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, Outlet, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppUpdateNotice } from '@/features/app-update/app-update-notice';
import { APP_UPDATE_CHECK_MS } from '@/features/app-update/use-app-update-watch';
import { createAppUpdateStore, type AppUpdateStore } from '@/stores/app-update-store';
import type { StoreApi } from 'zustand/vanilla';
import { PageReloadFake, PublishedBuildFake } from '../../support/published-build-fake';

const RUNNING = '/assets/index-old.js';
const DEPLOYED = '/assets/index-new.js';

describe('AppUpdateNotice', () => {
  let published: PublishedBuildFake;
  let appUpdate: StoreApi<AppUpdateStore>;
  let reloads: PageReloadFake;
  let visibility: DocumentVisibilityState;

  beforeEach(() => {
    published = new PublishedBuildFake(RUNNING);
    appUpdate = createAppUpdateStore({ running: RUNNING, published });
    reloads = new PageReloadFake();
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
  });

  afterEach(() => {
    // The own property shadows jsdom's getter on the prototype; deleting it brings that back.
    Reflect.deleteProperty(document, 'visibilityState');
    vi.useRealTimers();
  });

  function renderNotice(): void {
    const router = createMemoryRouter(
      [
        {
          element: (
            <>
              <Outlet />
              <AppUpdateNotice appUpdate={appUpdate} reloadPage={reloads.reload} />
            </>
          ),
          children: [
            {
              path: '/',
              element: (
                <>
                  <Link to="/account">Minha conta</Link>
                  <textarea aria-label="Anotações" />
                </>
              ),
            },
            { path: '/account', element: <h1>Minha conta</h1> },
          ],
        },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
  }

  async function deploy(): Promise<void> {
    published.publish(DEPLOYED);
    await act(() => appUpdate.getState().check());
  }

  async function setVisibility(next: DocumentVisibilityState): Promise<void> {
    visibility = next;
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
  }

  it('shows nothing while the running build is the published one', async () => {
    renderNotice();
    await act(() => appUpdate.getState().check());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('after a deploy, shows the notice and reloads on "Recarregar"', async () => {
    renderNotice();
    await deploy();
    expect(screen.getByRole('status')).toHaveTextContent('Saiu uma versão nova do Lorkarium.');
    expect(reloads.count).toBe(0);
    await userEvent.click(screen.getByRole('button', { name: 'Recarregar' }));
    expect(reloads.count).toBe(1);
  });

  it('asks again every few minutes', async () => {
    vi.useFakeTimers();
    renderNotice();
    await act(() => vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_MS));
    expect(published.asks).toBe(1);
  });

  it('asks when the window gets the focus back or the page is shown', async () => {
    renderNotice();
    await act(async () => {
      fireEvent.focus(window);
    });
    await setVisibility('hidden');
    await setVisibility('visible');
    expect(published.asks).toBe(2);
  });

  it('reloads on its own when the page goes hidden (the window sent to the tray)', async () => {
    renderNotice();
    await deploy();
    await setVisibility('hidden');
    expect(reloads.count).toBe(1);
  });

  it('reloads at once when the deploy is found with the page already hidden', async () => {
    renderNotice();
    visibility = 'hidden';
    await deploy();
    expect(reloads.count).toBe(1);
  });

  it('keeps the page when it goes hidden with a text field focused', async () => {
    renderNotice();
    screen.getByRole('textbox', { name: 'Anotações' }).focus();
    await deploy();
    await setVisibility('hidden');
    expect(reloads.count).toBe(0);
  });

  it('reloads on the next navigation, never on the route it turned stale on', async () => {
    renderNotice();
    await deploy();
    expect(reloads.count).toBe(0);
    await userEvent.click(screen.getByRole('link', { name: 'Minha conta' }));
    expect(reloads.count).toBe(1);
  });
});
