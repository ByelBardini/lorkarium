import type { CampaignRoleDto } from '@lorkarium/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN, detailOf } from '../../support/campaigns-api-fake';
import { DesktopWindowFake } from '../../support/desktop-window-fake';
import { vharnState } from '../../support/table-session-fixtures';

describe('the room header inside the window title bar', () => {
  let deps: TestDependencies;
  let router: ReturnType<typeof createMemoryRouter>;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
  });

  async function renderRoom(path = `/campaigns/${VHARN.id}/table`, inShell = true): Promise<void> {
    const routes = buildRoutes({
      ...deps,
      desktopWindow: inShell ? new DesktopWindowFake() : null,
    });
    router = createMemoryRouter(routes, { initialEntries: [path] });
    render(<RouterProvider router={router} />);
    await screen.findAllByRole('heading', { level: 1 });
    deps.tableSessionApi.emit(
      { kind: 'state', state: vharnState() },
      { kind: 'status', status: 'live' },
    );
  }

  function answerDetailAs(role: CampaignRoleDto): void {
    const value = detailOf(VHARN, { myRole: role, joinCode: null });
    deps.campaignsApi.answer('detail', { ok: true, value });
  }

  const bar = (): HTMLElement => screen.getByRole('banner', { name: 'Barra da janela' });
  const roomTop = (): HTMLElement => screen.getByRole('region', { name: 'Topo da sala' });

  it('in the app the room top lives in the title bar, which takes the room shape', async () => {
    await renderRoom();

    await waitFor(() => expect(bar()).toContainElement(roomTop()));
    expect(bar()).toHaveAttribute('data-variant', 'room');
    expect(document.documentElement.style.getPropertyValue('--title-bar-height')).toBe('44px');
    const top = within(roomTop());
    expect(top.getByRole('heading', { level: 1, name: VHARN.name })).toBeInTheDocument();
    expect(await top.findByRole('button', { name: /online/ })).toBeInTheDocument();
    expect(top.getByRole('button', { name: 'Sair da mesa' })).toBeInTheDocument();
  });

  it('no other room top stays in the body of the room', async () => {
    await renderRoom();

    await waitFor(() => expect(bar()).toContainElement(roomTop()));
    expect(screen.getAllByRole('region', { name: 'Topo da sala' })).toHaveLength(1);
  });

  it('the interactive parts of the room top do not drag the window', async () => {
    await renderRoom();

    await waitFor(() => expect(bar()).toContainElement(roomTop()));
    const leave = within(roomTop()).getByRole('button', { name: 'Sair da mesa' });
    expect(leave.closest('[data-app-region]')).toHaveAttribute('data-app-region', 'no-drag');
    const online = await within(roomTop()).findByRole('button', { name: /online/ });
    expect(online.closest('[data-app-region]')).toHaveAttribute('data-app-region', 'no-drag');
  });

  it.each([
    ['settings', 'Configurações da mesa'],
    ['conditions', 'Condições da mesa'],
  ])('%s covering the room gives the bar back its place (%s)', async (page, place) => {
    await renderRoom(`/campaigns/${VHARN.id}/table/${page}`);

    await waitFor(() => expect(bar()).toHaveTextContent(`LORKARIUM / ${place}`));
    expect(bar()).toHaveAttribute('data-variant', 'place');
    expect(within(bar()).queryByRole('region', { name: 'Topo da sala' })).not.toBeInTheDocument();
    expect(within(bar()).getByRole('button', { name: 'Minimizar' })).toBeInTheDocument();
  });

  it('leaving the table gives the bar back its place shape', async () => {
    await renderRoom();
    await waitFor(() => expect(bar()).toContainElement(roomTop()));

    await userEvent.click(within(roomTop()).getByRole('button', { name: 'Sair da mesa' }));

    await waitFor(() => expect(bar()).toHaveTextContent('LORKARIUM / Suas mesas'));
    expect(bar()).toHaveAttribute('data-variant', 'place');
  });

  it('in a browser the room top stays in the room, with no title bar', async () => {
    await renderRoom(`/campaigns/${VHARN.id}/table`, false);

    expect(roomTop()).toBeInTheDocument();
    expect(screen.queryByRole('banner', { name: 'Barra da janela' })).not.toBeInTheDocument();
  });

  it('a spectator sees the badge in the bar', async () => {
    answerDetailAs('spectator');
    await renderRoom();

    await waitFor(() => expect(bar()).toContainElement(roomTop()));
    expect(within(roomTop()).getByText('Espectador')).toBeInTheDocument();
  });

  it('a player sees neither the code nor the master pages in the bar', async () => {
    answerDetailAs('player');
    await renderRoom();

    await waitFor(() => expect(bar()).toContainElement(roomTop()));
    const top = within(roomTop());
    expect(top.queryByRole('button', { name: 'Copiar código' })).not.toBeInTheDocument();
    expect(top.queryByRole('link', { name: 'Configurações da mesa' })).not.toBeInTheDocument();
    expect(top.getByRole('link', { name: 'Biblioteca' })).toBeInTheDocument();
  });
});
