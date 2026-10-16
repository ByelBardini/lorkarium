import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { QUELM, VHARN, detailOf } from '../../support/campaigns-api-fake';
import { biaJoined, biaLeft, vharnState } from '../../support/table-session-fixtures';

describe('campaign table page', () => {
  let deps: TestDependencies;
  let router: ReturnType<typeof createMemoryRouter>;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
  });

  function renderTable(): void {
    router = createMemoryRouter(buildRoutes(deps), {
      initialEntries: [`/campaigns/${VHARN.id}/table`],
    });
    render(<RouterProvider router={router} />);
  }

  async function renderLiveTable(): Promise<void> {
    renderTable();
    await screen.findByRole('heading', { level: 1 });
    deps.tableSessionApi.emit(
      { kind: 'state', state: vharnState() },
      { kind: 'status', status: 'live' },
    );
  }

  function presencePanel(): HTMLElement {
    return screen.getByRole('region', { name: 'Na mesa' });
  }

  function memberItem(name: string): HTMLElement {
    const item = within(presencePanel())
      .getAllByRole('listitem')
      .find((candidate) => within(candidate).queryByText(name));
    if (!item) throw new Error(`no participant named ${name} in the panel`);
    return item;
  }

  it('names the campaign, says the board opens here and links back to the campaigns', async () => {
    renderTable();
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(VHARN.name);
    expect(screen.getByText('O tabuleiro abre aqui.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para as mesas' })).toHaveAttribute('href', '/');
  });

  it('titles the page after the campaign', async () => {
    renderTable();
    await waitFor(() => expect(document.title).toBe(`Lorkarium · ${VHARN.name}`));
  });

  it('a campaign the user is not in reads "Mesa não encontrada." with the way back', async () => {
    deps.campaignsApi.answer('detail', { ok: false, failure: { kind: 'not_found' } });
    renderTable();
    expect(
      await screen.findByRole('heading', { name: 'Mesa não encontrada.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para as mesas' })).toHaveAttribute('href', '/');
  });

  it('opens the live session of this table and reads "Conectando à mesa…" until the snapshot', async () => {
    renderTable();
    await screen.findByRole('heading', { level: 1 });
    expect(deps.tableSessionApi.opened).toEqual([VHARN.id]);
    expect(within(presencePanel()).getByRole('status')).toHaveTextContent('Conectando à mesa…');
  });

  it('with the snapshot, the panel counts who is online and lists each participant in order', async () => {
    await renderLiveTable();
    expect(within(presencePanel()).getByText('2 de 3 online')).toBeInTheDocument();
    const items = within(presencePanel()).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'AnaMestreonline',
      'BiaJogadoroffline',
      'CaioJogadoronline',
    ]);
  });

  it('Bia joining turns her online and the count to 3 de 3', async () => {
    await renderLiveTable();
    deps.tableSessionApi.emit({ kind: 'memberJoined', event: biaJoined() });
    expect(within(memberItem('Bia')).getByText('online')).toBeInTheDocument();
    expect(within(presencePanel()).getByText('3 de 3 online')).toBeInTheDocument();
  });

  it('Bia leaving turns her offline', async () => {
    await renderLiveTable();
    deps.tableSessionApi.emit(
      { kind: 'memberJoined', event: biaJoined() },
      { kind: 'memberLeft', event: biaLeft() },
    );
    expect(within(memberItem('Bia')).getByText('offline')).toBeInTheDocument();
  });

  it('a drop reads "Reconectando…" and coming back reads "Ao vivo"', async () => {
    await renderLiveTable();
    deps.tableSessionApi.emit({ kind: 'status', status: 'reconnecting' });
    expect(within(presencePanel()).getByRole('status')).toHaveTextContent('Reconectando…');
    deps.tableSessionApi.emit({ kind: 'status', status: 'live' });
    expect(within(presencePanel()).getByRole('status')).toHaveTextContent('Ao vivo');
  });

  it('a table the server refuses reads that it does not exist or the user is not in it', async () => {
    renderTable();
    await screen.findByRole('heading', { level: 1 });
    deps.tableSessionApi.emit({ kind: 'failed', failure: 'not_found' });
    expect(within(presencePanel()).getByRole('alert')).toHaveTextContent(
      'Essa mesa não existe ou você não participa dela.',
    );
  });

  it('a session the server no longer accepts signs out and goes to the login with next', async () => {
    renderTable();
    await screen.findByRole('heading', { level: 1 });
    deps.tableSessionApi.emit({ kind: 'failed', failure: 'unauthenticated' });
    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        `/login?next=${encodeURIComponent(`/campaigns/${VHARN.id}/table`)}`,
      ),
    );
    expect(deps.sessionStore.getState().session).toEqual({ status: 'anonymous' });
  });

  it('going back to the campaigns keeps the table open', async () => {
    await renderLiveTable();
    await userEvent.click(screen.getByRole('link', { name: 'Voltar para as mesas' }));
    await screen.findByRole('heading', { level: 1, name: /E aí/ });
    expect(deps.tableSessionApi.closedIds).toEqual([]);
  });

  it('coming back to the table opens nothing new and shows the current presence at once', async () => {
    await renderLiveTable();
    await userEvent.click(screen.getByRole('link', { name: 'Voltar para as mesas' }));
    await screen.findByRole('heading', { level: 1, name: /E aí/ });
    await router.navigate(`/campaigns/${VHARN.id}/table`);
    await screen.findByRole('heading', { level: 1, name: VHARN.name });
    expect(deps.tableSessionApi.opened).toEqual([VHARN.id]);
    expect(within(presencePanel()).getByText('2 de 3 online')).toBeInTheDocument();
    expect(within(presencePanel()).getByRole('status')).toHaveTextContent('Ao vivo');
  });

  it('visiting QUELM after VHARN keeps both open', async () => {
    await renderLiveTable();
    deps.campaignsApi.answer('detail', { ok: true, value: detailOf(QUELM) });
    await router.navigate(`/campaigns/${QUELM.id}/table`);
    await screen.findByRole('heading', { level: 1, name: QUELM.name });
    expect(deps.tableSessionApi.opened).toEqual([VHARN.id, QUELM.id]);
    expect(deps.tableSessionApi.closedIds).toEqual([]);
  });

  describe('with 5 tables already open', () => {
    const OTHER_TABLES = [1, 2, 3, 4, 5].map((n) => ({
      campaignId: `a1000000-0000-4000-8000-00000000000${n}`,
      name: `Mesa ${n}`,
    }));
    const TOO_MANY = 'Você já tem 5 mesas abertas. Feche uma no menu lateral para abrir esta.';

    beforeEach(() => {
      for (const table of OTHER_TABLES) deps.openTables.getState().open(table);
    });

    it('visiting a 6th table says why and opens nothing', async () => {
      renderTable();
      await screen.findByRole('heading', { level: 1 });
      expect(screen.getByRole('alert')).toHaveTextContent(TOO_MANY);
      expect(deps.tableSessionApi.opened).not.toContain(VHARN.id);
    });

    it('closing one of the 5 opens the 6th on its own', async () => {
      renderTable();
      await screen.findByRole('heading', { level: 1 });
      act(() => deps.openTables.getState().close(OTHER_TABLES[0]?.campaignId ?? ''));
      expect(deps.tableSessionApi.opened.at(-1)).toBe(VHARN.id);
      expect(within(presencePanel()).getByRole('status')).toHaveTextContent('Conectando à mesa…');
    });
  });

  it('a join the server refuses as too_many_tables reads the same message in the panel', async () => {
    renderTable();
    await screen.findByRole('heading', { level: 1 });
    deps.tableSessionApi.emit({ kind: 'failed', failure: 'too_many_tables' });
    expect(within(presencePanel()).getByRole('alert')).toHaveTextContent(
      'Você já tem 5 mesas abertas. Feche uma no menu lateral para abrir esta.',
    );
  });

  it('"Sair da mesa" closes the table once and goes to the home without reopening it', async () => {
    await renderLiveTable();
    await userEvent.click(screen.getByRole('button', { name: 'Sair da mesa' }));
    await screen.findByRole('heading', { level: 1, name: /E aí/ });
    expect(deps.tableSessionApi.closedIds).toEqual([VHARN.id]);
    expect(deps.tableSessionApi.opened).toEqual([VHARN.id]);
  });

  it('leaving the table on screen from the rail goes home, closes it once and does not reopen it', async () => {
    await renderLiveTable();
    const rail = screen.getByRole('complementary', { name: 'Menu lateral' });
    const nav = within(rail).getByRole('navigation', { name: 'Mesas abertas' });
    fireEvent.contextMenu(within(nav).getByRole('link', { name: new RegExp(VHARN.name) }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sair da mesa' }));
    await screen.findByRole('heading', { level: 1, name: /E aí/ });
    expect(router.state.location.pathname).toBe('/');
    expect(deps.tableSessionApi.closedIds).toEqual([VHARN.id]);
    expect(deps.tableSessionApi.opened).toEqual([VHARN.id]);
  });
});
