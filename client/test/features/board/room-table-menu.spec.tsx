import type { AuthUserDto, CampaignDetailDto } from '@lorkarium/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA, ROOT_ADMIN } from '../../support/auth-api-fake';
import { detailOf, VHARN } from '../../support/campaigns-api-fake';
import { vharnBoard, vharnState } from '../../support/table-session-fixtures';

const AS_PLAYER = detailOf(VHARN, { myRole: 'player', joinCode: null });
const AS_JUGGERNAUT = detailOf(VHARN, { myRole: 'master', juggernaut: true });

describe('play room · juggernaut mode in the header menu', () => {
  let deps: TestDependencies;
  let router: ReturnType<typeof createMemoryRouter>;

  beforeEach(() => {
    deps = testDependencies();
  });

  async function renderRoomAs(reader: AuthUserDto, campaign: CampaignDetailDto): Promise<void> {
    deps.authApi.answerMeWith(reader);
    deps.campaignsApi.answer('detail', { ok: true, value: campaign });
    router = createMemoryRouter(buildRoutes(deps), {
      initialEntries: [`/campaigns/${VHARN.id}/table`],
    });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1, name: VHARN.name });
    deps.tableSessionApi.emit(
      { kind: 'state', state: vharnState() },
      { kind: 'status', status: 'live' },
      { kind: 'board', state: vharnBoard() },
    );
  }

  const header = () => screen.getByRole('region', { name: 'Topo da sala' });
  const moreActions = () => within(header()).queryByRole('button', { name: 'Mais ações da mesa' });

  async function pick(item: string): Promise<void> {
    const menu = moreActions();
    if (!menu) throw new Error('no "Mais ações da mesa" in the header');
    await userEvent.click(menu);
    await userEvent.click(await screen.findByRole('menuitem', { name: item }));
  }

  async function itemsOfMenu(): Promise<string[]> {
    const menu = moreActions();
    if (!menu) throw new Error('no "Mais ações da mesa" in the header');
    await userEvent.click(menu);
    const items = await screen.findAllByRole('menuitem');
    return items.map((item) => item.textContent ?? '');
  }

  it('an admin playing at the table turns the mode on, and the room reads the campaign again', async () => {
    await renderRoomAs(ROOT_ADMIN, AS_PLAYER);
    deps.campaignsApi.answer('detail', { ok: true, value: AS_JUGGERNAUT });

    await pick('Ativar modo juggernaut');

    expect(deps.campaignsApi.callsOf('startJuggernaut')).toEqual([VHARN.id]);
    await vi.waitFor(async () => expect(await itemsOfMenu()).toEqual(['Sair do modo juggernaut']));
  });

  it('leaving the mode back as a player reads the campaign again and keeps the table open', async () => {
    await renderRoomAs(ROOT_ADMIN, AS_JUGGERNAUT);
    deps.campaignsApi.answer('endJuggernaut', { ok: true, value: { myRole: 'player' } });
    deps.campaignsApi.answer('detail', { ok: true, value: AS_PLAYER });

    await pick('Sair do modo juggernaut');

    expect(deps.campaignsApi.callsOf('endJuggernaut')).toEqual([VHARN.id]);
    await vi.waitFor(async () => expect(await itemsOfMenu()).toEqual(['Ativar modo juggernaut']));
    expect(router.state.location.pathname).toBe(`/campaigns/${VHARN.id}/table`);
    expect(deps.tableSessionApi.closedIds).toEqual([]);
  });

  it('leaving the mode of a table the admin was not in closes it and goes to Explorar', async () => {
    await renderRoomAs(ROOT_ADMIN, AS_JUGGERNAUT);
    deps.campaignsApi.answer('endJuggernaut', { ok: true, value: { myRole: null } });

    await pick('Sair do modo juggernaut');

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/campaigns/public'));
    expect(deps.tableSessionApi.closedIds).toEqual([VHARN.id]);
  });

  it('a refused activation is said on the status line of the board', async () => {
    await renderRoomAs(ROOT_ADMIN, AS_PLAYER);
    deps.campaignsApi.answer('startJuggernaut', { ok: false, failure: { kind: 'forbidden' } });

    await pick('Ativar modo juggernaut');

    expect(
      await within(screen.getByRole('status', { name: 'Status do tabuleiro' })).findByText(
        'Só um admin entra como juggernaut.',
      ),
    ).toBeInTheDocument();
  });

  it('the owner, even an admin, has no juggernaut item', async () => {
    await renderRoomAs(ROOT_ADMIN, { ...AS_PLAYER, myRole: 'master', ownerId: ROOT_ADMIN.id });

    expect(moreActions()).toBeNull();
  });

  it('an account that is not admin has no juggernaut item', async () => {
    await renderRoomAs(ANA, { ...AS_PLAYER, ownerId: '9c2f4e61-7a3b-4d5c-8e9f-0b1a2c3d4e5f' });

    expect(moreActions()).toBeNull();
  });
});
