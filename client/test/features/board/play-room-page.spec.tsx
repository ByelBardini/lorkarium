import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cell } from '@lorkarium/game-core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { ROOM_PANEL_STORAGE_KEY } from '@/stores/room-layout-store';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { QUELM, VHARN, detailOf } from '../../support/campaigns-api-fake';
import {
  LYRA_ID,
  biaJoined,
  biaLeft,
  lyra,
  tokenMovedAt,
  vharnBoard,
  LYRA_COMBATANT,
  eventAt,
  vharnCombat,
  vharnState,
} from '../../support/table-session-fixtures';
import { emulateViewport } from '../../support/viewport';

const TOO_MANY = 'Você já tem 5 mesas abertas. Feche uma no menu lateral para abrir esta.';

describe('play room page', () => {
  let deps: TestDependencies;
  let router: ReturnType<typeof createMemoryRouter>;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
  });

  function renderRoom(campaign = VHARN): void {
    if (campaign !== VHARN)
      deps.campaignsApi.answer('detail', { ok: true, value: detailOf(campaign) });
    router = createMemoryRouter(buildRoutes(deps), {
      initialEntries: [`/campaigns/${campaign.id}/table`],
    });
    render(<RouterProvider router={router} />);
  }

  async function renderLiveRoom(): Promise<void> {
    renderRoom();
    await screen.findByRole('heading', { level: 1 });
    deps.tableSessionApi.emit(
      { kind: 'state', state: vharnState() },
      { kind: 'status', status: 'live' },
    );
  }

  function roomHeader(): HTMLElement {
    return screen.getByRole('region', { name: 'Topo da sala' });
  }

  function boardStatus(): HTMLElement {
    return screen.getByRole('status', { name: 'Status do tabuleiro' });
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

  describe('top bar', () => {
    it('names the campaign in the h1 and titles the page after it', async () => {
      renderRoom();
      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(VHARN.name);
      await waitFor(() => expect(document.title).toBe(`Lorkarium · ${VHARN.name}`));
    });

    it('the master sees the formatted code with "Copiar código"', async () => {
      renderRoom();
      await screen.findByRole('heading', { level: 1 });
      expect(within(roomHeader()).getByText('VHRN-7K2Q')).toBeInTheDocument();
      await userEvent.click(within(roomHeader()).getByRole('button', { name: 'Copiar código' }));
      expect(deps.clipboard.copied).toEqual(['VHRN-7K2Q']);
    });

    it('a player does not see the code', async () => {
      renderRoom(QUELM);
      await screen.findByRole('heading', { level: 1, name: QUELM.name });
      expect(within(roomHeader()).queryByRole('button', { name: 'Copiar código' })).toBeNull();
    });

    it('"2 online" counts the snapshot and opens the "Na mesa" tab', async () => {
      await renderLiveRoom();
      const online = within(roomHeader()).getByRole('button', { name: '2 online' });
      await userEvent.click(online);
      expect(screen.getByRole('tab', { name: 'Na mesa' })).toHaveAttribute('aria-selected', 'true');
      expect(presencePanel()).toBeInTheDocument();
    });

    it('"Sair da mesa" closes the table once and goes to the home without reopening it', async () => {
      await renderLiveRoom();
      await userEvent.click(within(roomHeader()).getByRole('button', { name: 'Sair da mesa' }));
      await screen.findByRole('heading', { level: 1, name: /E aí/ });
      expect(deps.tableSessionApi.closedIds).toEqual([VHARN.id]);
      expect(deps.tableSessionApi.opened).toEqual([VHARN.id]);
    });
  });

  describe('panel', () => {
    it('opens on the "Combate" tab, reading "Fora de combate"', async () => {
      renderRoom();
      await screen.findByRole('heading', { level: 1 });
      expect(screen.getByRole('tab', { name: 'Combate' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tabpanel', { name: 'Combate' })).toHaveTextContent(
        'Fora de combate',
      );
    });

    it('"Na mesa" lists each participant in order with how many are online', async () => {
      await renderLiveRoom();
      await userEvent.click(screen.getByRole('tab', { name: 'Na mesa' }));
      expect(within(presencePanel()).getByText('2 de 3 online')).toBeInTheDocument();
      expect(
        within(presencePanel())
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['AnaMestreonline', 'BiaJogadoroffline', 'CaioJogadoronline']);
    });

    it('Bia joining turns her online, and leaving turns her offline', async () => {
      await renderLiveRoom();
      await userEvent.click(screen.getByRole('tab', { name: 'Na mesa' }));
      deps.tableSessionApi.emit({ kind: 'memberJoined', event: biaJoined() });
      expect(within(memberItem('Bia')).getByText('online')).toBeInTheDocument();
      deps.tableSessionApi.emit({ kind: 'memberLeft', event: biaLeft() });
      expect(within(memberItem('Bia')).getByText('offline')).toBeInTheDocument();
    });

    it('"Recolher painel" hides the panel, remembers it and turns into "Abrir painel"', async () => {
      renderRoom();
      await screen.findByRole('heading', { level: 1 });
      await userEvent.click(screen.getByRole('button', { name: 'Recolher painel' }));
      expect(screen.queryByRole('tab', { name: 'Combate' })).toBeNull();
      expect(deps.roomLayoutStorage.values.get(ROOM_PANEL_STORAGE_KEY)).toBe('closed');
      await userEvent.click(screen.getByRole('button', { name: 'Abrir painel' }));
      expect(screen.getByRole('tab', { name: 'Combate' })).toBeInTheDocument();
    });
  });

  describe('focus mode', () => {
    it('"Modo foco" hides the top bar and the panel and stays pressed', async () => {
      renderRoom();
      await screen.findByRole('heading', { level: 1 });
      const focus = screen.getByRole('button', { name: 'Modo foco' });
      expect(focus).toHaveAttribute('aria-pressed', 'false');
      await userEvent.click(focus);
      expect(screen.queryByRole('region', { name: 'Topo da sala' })).toBeNull();
      expect(screen.queryByRole('tab', { name: 'Combate' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Modo foco' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('F turns focus mode on and Esc turns it off', async () => {
      renderRoom();
      await screen.findByRole('heading', { level: 1 });
      await userEvent.keyboard('f');
      expect(screen.queryByRole('region', { name: 'Topo da sala' })).toBeNull();
      await userEvent.keyboard('{Escape}');
      expect(roomHeader()).toBeInTheDocument();
    });

    it('F typed in a field does not turn focus mode on', async () => {
      renderRoom();
      await screen.findByRole('heading', { level: 1 });
      const field = document.createElement('input');
      document.body.append(field);
      field.focus();
      await userEvent.keyboard('f');
      expect(roomHeader()).toBeInTheDocument();
      field.remove();
    });
  });

  describe('states', () => {
    it('opens the live session and reads "Conectando à mesa…", then "Carregando o tabuleiro…"', async () => {
      renderRoom();
      await screen.findByRole('heading', { level: 1 });
      expect(deps.tableSessionApi.opened).toEqual([VHARN.id]);
      expect(boardStatus()).toHaveTextContent('Conectando à mesa…');
      deps.tableSessionApi.emit({ kind: 'status', status: 'live' });
      expect(boardStatus()).toHaveTextContent('Carregando o tabuleiro…');
    });

    it('the board snapshot ends "Carregando o tabuleiro…"', async () => {
      await renderLiveRoom();
      deps.tableSessionApi.emit({ kind: 'board', state: vharnBoard() });
      expect(boardStatus()).not.toHaveTextContent('Carregando o tabuleiro…');
    });

    it('a failed board sync reads why, and "Tentar de novo" asks for the board again', async () => {
      await renderLiveRoom();
      deps.tableSessionApi.emit({ kind: 'boardFailed', failure: 'offline' });
      expect(screen.getByRole('alert')).toHaveTextContent('Não deu para carregar o tabuleiro.');
      await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
      expect(deps.tableSessionApi.resyncedIds).toEqual([VHARN.id]);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(boardStatus()).toHaveTextContent('Carregando o tabuleiro…');
    });

    it('a drop reads "Reconectando…" in the status line', async () => {
      await renderLiveRoom();
      deps.tableSessionApi.emit({ kind: 'status', status: 'reconnecting' });
      expect(boardStatus()).toHaveTextContent('Reconectando…');
    });

    it('a table the server refuses reads that it does not exist or the user is not in it', async () => {
      renderRoom();
      await screen.findByRole('heading', { level: 1 });
      deps.tableSessionApi.emit({ kind: 'failed', failure: 'not_found' });
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Essa mesa não existe ou você não participa dela.',
      );
    });

    it('a campaign the user is not in reads "Mesa não encontrada." with the way back', async () => {
      deps.campaignsApi.answer('detail', { ok: false, failure: { kind: 'not_found' } });
      renderRoom();
      expect(
        await screen.findByRole('heading', { name: 'Mesa não encontrada.' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Voltar para as mesas' })).toHaveAttribute(
        'href',
        '/',
      );
    });

    it('a session the server no longer accepts signs out and goes to the login with next', async () => {
      renderRoom();
      await screen.findByRole('heading', { level: 1 });
      deps.tableSessionApi.emit({ kind: 'failed', failure: 'unauthenticated' });
      await waitFor(() =>
        expect(router.state.location.pathname + router.state.location.search).toBe(
          `/login?next=${encodeURIComponent(`/campaigns/${VHARN.id}/table`)}`,
        ),
      );
      expect(deps.sessionStore.getState().session).toEqual({ status: 'anonymous' });
    });
  });

  describe('open tables', () => {
    it('going home keeps the table open, and coming back opens nothing new', async () => {
      await renderLiveRoom();
      await act(() => router.navigate('/'));
      await screen.findByRole('heading', { level: 1, name: /E aí/ });
      expect(deps.tableSessionApi.closedIds).toEqual([]);
      await act(() => router.navigate(`/campaigns/${VHARN.id}/table`));
      await screen.findByRole('heading', { level: 1, name: VHARN.name });
      expect(deps.tableSessionApi.opened).toEqual([VHARN.id]);
      expect(within(roomHeader()).getByRole('button', { name: '2 online' })).toBeInTheDocument();
    });

    it('visiting QUELM after VHARN keeps both open', async () => {
      await renderLiveRoom();
      deps.campaignsApi.answer('detail', { ok: true, value: detailOf(QUELM) });
      await act(() => router.navigate(`/campaigns/${QUELM.id}/table`));
      await screen.findByRole('heading', { level: 1, name: QUELM.name });
      expect(deps.tableSessionApi.opened).toEqual([VHARN.id, QUELM.id]);
      expect(deps.tableSessionApi.closedIds).toEqual([]);
    });

    it('leaving the table on screen from the rail goes home and closes it once', async () => {
      await renderLiveRoom();
      const rail = screen.getByRole('complementary', { name: 'Menu lateral' });
      const nav = within(rail).getByRole('navigation', { name: 'Mesas abertas' });
      fireEvent.contextMenu(within(nav).getByRole('link', { name: new RegExp(VHARN.name) }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Sair da mesa' }));
      await screen.findByRole('heading', { level: 1, name: /E aí/ });
      expect(deps.tableSessionApi.closedIds).toEqual([VHARN.id]);
      expect(deps.tableSessionApi.opened).toEqual([VHARN.id]);
    });

    describe('with 5 tables already open', () => {
      const OTHER_TABLES = [1, 2, 3, 4, 5].map((n) => ({
        campaignId: `a1000000-0000-4000-8000-00000000000${n}`,
        name: `Mesa ${n}`,
      }));

      beforeEach(() => {
        for (const table of OTHER_TABLES) deps.openTables.getState().open(table);
      });

      it('a 6th table says why in place of the board and opens nothing', async () => {
        renderRoom();
        await screen.findByRole('heading', { level: 1 });
        expect(screen.getByRole('alert')).toHaveTextContent(TOO_MANY);
        expect(deps.tableSessionApi.opened).not.toContain(VHARN.id);
      });

      it('closing one of the 5 opens the 6th on its own', async () => {
        renderRoom();
        await screen.findByRole('heading', { level: 1 });
        act(() => deps.openTables.getState().close(OTHER_TABLES[0]?.campaignId ?? ''));
        expect(deps.tableSessionApi.opened.at(-1)).toBe(VHARN.id);
        expect(boardStatus()).toHaveTextContent('Conectando à mesa…');
      });
    });
  });

  describe('board and tools', () => {
    async function renderBoardRoom(): Promise<void> {
      await renderLiveRoom();
      deps.tableSessionApi.emit({ kind: 'board', state: vharnBoard() });
      await act(() => Promise.resolve());
    }

    it('the board snapshot mounts the canvas, named after the scene, and draws it', async () => {
      await renderBoardRoom();
      expect(screen.getByRole('application')).toHaveAccessibleName(
        'Tabuleiro: Cena 1, 20 × 12 casas',
      );
      expect(deps.boardRenderers.latest().lastView?.grid.cells).toEqual({
        widthCells: 20,
        heightCells: 12,
      });
    });

    it('no canvas is mounted before the board snapshot', async () => {
      await renderLiveRoom();
      expect(screen.queryByRole('application')).toBeNull();
      expect(deps.boardRenderers.made).toEqual([]);
    });

    it('R picks the ruler, which measures a drag and reads it in the scene unit', async () => {
      await renderBoardRoom();
      await userEvent.keyboard('r');
      expect(screen.getByRole('button', { name: 'Régua (R)' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(boardStatus()).toHaveTextContent('Arraste para medir.');
      const renderer = deps.boardRenderers.latest();
      renderer.emit({ kind: 'pointerDown', cell: cell(0, 0) });
      renderer.emit({ kind: 'pointerMove', cell: cell(3, 2) });
      expect(renderer.lastView?.ruler?.label).toBe('3 casas · 4,5 m');
      await userEvent.keyboard('{Escape}');
      expect(renderer.lastView?.ruler).toBeNull();
    });

    it('G hides the grid for this viewer only', async () => {
      await renderBoardRoom();
      await userEvent.keyboard('g');
      expect(deps.boardRenderers.latest().lastView?.grid.visible).toBe(false);
    });

    it('the zoom label follows the camera of the canvas', async () => {
      await renderBoardRoom();
      deps.boardRenderers.latest().emit({ kind: 'cameraChanged', zoom: 1.25 });
      expect(screen.getByRole('toolbar', { name: 'Ferramentas do tabuleiro' })).toHaveTextContent(
        '125%',
      );
    });

    it('the master opens "Configurar cena", saves and the command goes to the server', async () => {
      await renderBoardRoom();
      await userEvent.click(screen.getByRole('button', { name: 'Configurar cena' }));
      const dialog = await screen.findByRole('dialog', { name: 'Configurar cena' });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
      expect(deps.boardCommands.sent).toEqual([
        expect.objectContaining({ name: 'configureScene', campaignId: VHARN.id }),
      ]);
      expect(screen.queryByRole('dialog', { name: 'Configurar cena' })).toBeNull();
    });

    it('keys typed in the grid dialog are not room shortcuts', async () => {
      await renderBoardRoom();
      await userEvent.click(screen.getByRole('button', { name: 'Configurar cena' }));
      await userEvent.type(await screen.findByLabelText('Unidade'), 'fr');
      // The modal hides the rest of the room from assistive tech, so look past it.
      const hidden = { hidden: true };
      expect(screen.getByRole('button', { name: 'Régua (R)', ...hidden })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      expect(deps.roomLayout.getState().focus).toBe(false);
    });

    it('measuring with the ruler sends no command', async () => {
      await renderBoardRoom();
      await userEvent.keyboard('r');
      deps.boardRenderers.latest().emit({ kind: 'pointerDown', cell: cell(0, 0) });
      deps.boardRenderers.latest().emit({ kind: 'pointerUp', cell: cell(4, 4) });
      expect(deps.boardCommands.sent).toEqual([]);
    });

    it('"Novo token" (master) creates the token at the cell in the center of the view', async () => {
      await renderBoardRoom();
      deps.boardRenderers.latest().centerCell = cell(9, 5);
      await userEvent.click(screen.getByRole('button', { name: 'Novo token' }));
      const dialog = await screen.findByRole('dialog', { name: 'Novo token' });
      await userEvent.type(within(dialog).getByLabelText('Nome'), 'Goblin');
      expect(within(dialog).getByRole('checkbox', { name: 'Caio' })).toBeInTheDocument();
      await userEvent.click(within(dialog).getByRole('button', { name: 'Criar token' }));
      expect(deps.boardCommands.sentAs('createToken')).toEqual([
        expect.objectContaining({
          fields: expect.objectContaining({ name: 'Goblin', col: 9, row: 5 }),
        }),
      ]);
    });

    it('a player does not see "Configurar cena"', async () => {
      renderRoom(QUELM);
      await screen.findByRole('heading', { level: 1, name: QUELM.name });
      expect(screen.queryByRole('button', { name: 'Configurar cena' })).toBeNull();
    });
  });

  describe('tokens on the board', () => {
    async function renderRoomWithLyra(): Promise<void> {
      await renderLiveRoom();
      deps.tableSessionApi.emit({ kind: 'board', state: vharnBoard({ tokens: [lyra()] }) });
      await act(() => Promise.resolve());
    }

    function lastView() {
      return deps.boardRenderers.latest().lastView;
    }

    it('dropping Lyra on (8, 6) sends the move and shows the ghost until the answer', async () => {
      deps.boardCommands.hold();
      await renderRoomWithLyra();
      deps.boardRenderers
        .latest()
        .emit({ kind: 'tokenDropped', tokenId: LYRA_ID, cell: cell(8, 6) });
      expect(deps.boardCommands.sentAs('moveToken')).toEqual([
        { name: 'moveToken', campaignId: VHARN.id, fields: { tokenId: LYRA_ID, col: 8, row: 6 } },
      ]);
      expect(lastView()?.ghosts).toEqual([{ tokenId: LYRA_ID, col: 8, row: 6, size: 1 }]);
      deps.tableSessionApi.emit({ kind: 'boardEvent', event: tokenMovedAt(5, { col: 8, row: 6 }) });
      await act(async () => deps.boardCommands.release());
      expect(lastView()?.tokens[0]).toMatchObject({ col: 8, row: 6 });
      expect(lastView()?.ghosts).toEqual([]);
    });

    it('dropping Lyra off the scene sends nothing', async () => {
      await renderRoomWithLyra();
      deps.boardRenderers.latest().emit({ kind: 'tokenDropped', tokenId: LYRA_ID, cell: null });
      expect(deps.boardCommands.sent).toEqual([]);
    });

    it('a refused move puts Lyra back and says "Esse token não é seu."', async () => {
      deps.boardCommands.answerWith({ ok: false, failure: 'forbidden' });
      await renderRoomWithLyra();
      deps.boardRenderers
        .latest()
        .emit({ kind: 'tokenDropped', tokenId: LYRA_ID, cell: cell(8, 6) });
      await act(() => Promise.resolve());
      expect(lastView()?.ghosts).toEqual([]);
      expect(lastView()?.tokens[0]).toMatchObject({ col: 3, row: 4 });
      expect(boardStatus()).toHaveTextContent('Esse token não é seu.');
    });

    it('clicking Lyra selects her, and clicking the empty board clears it', async () => {
      await renderRoomWithLyra();
      deps.boardRenderers.latest().emit({ kind: 'tokenPicked', tokenId: LYRA_ID, additive: false });
      expect(lastView()?.tokens[0]?.selected).toBe(true);
      deps.boardRenderers.latest().emit({ kind: 'pointerDown', cell: cell(0, 0) });
      expect(lastView()?.tokens[0]?.selected).toBe(false);
    });

    it('while reconnecting nothing is draggable and a drop sends nothing', async () => {
      await renderRoomWithLyra();
      deps.tableSessionApi.emit({ kind: 'status', status: 'reconnecting' });
      expect(lastView()?.tokens[0]?.draggable).toBe(false);
      deps.boardRenderers
        .latest()
        .emit({ kind: 'tokenDropped', tokenId: LYRA_ID, cell: cell(8, 6) });
      expect(deps.boardCommands.sent).toEqual([]);
    });

    it('the snapshot of a reconnection drops a pending preview', async () => {
      deps.boardCommands.hold();
      await renderRoomWithLyra();
      deps.boardRenderers
        .latest()
        .emit({ kind: 'tokenDropped', tokenId: LYRA_ID, cell: cell(8, 6) });
      deps.tableSessionApi.emit({ kind: 'board', state: vharnBoard({ tokens: [lyra()] }) });
      expect(lastView()?.ghosts).toEqual([]);
    });
  });

  describe('combat in the room', () => {
    it('the top bar reads "Rodada 3 · Vez de Kael", and the line stays in focus mode', async () => {
      await renderLiveRoom();
      const kael = lyra({ id: 'kael-token', name: 'Kael' });
      deps.tableSessionApi.emit({
        kind: 'board',
        state: vharnBoard({ tokens: [kael, lyra()], combat: vharnCombat({ round: 3 }) }),
      });
      expect(within(roomHeader()).getByText('Rodada 3 · Vez de Kael')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Modo foco' }));
      expect(screen.getByText('Rodada 3 · Vez de Kael')).toBeInTheDocument();
    });

    async function renderCombatRoom(): Promise<void> {
      await renderLiveRoom();
      const kael = lyra({ id: 'kael-token', name: 'Kael', col: 7, row: 5 });
      deps.tableSessionApi.emit({
        kind: 'board',
        state: vharnBoard({ tokens: [kael, lyra()], combat: vharnCombat() }),
      });
      await act(() => Promise.resolve());
    }

    it('the token on turn has the gold ring on the board', async () => {
      await renderCombatRoom();
      const views = deps.boardRenderers.latest().lastView?.tokens ?? [];
      expect(views.find(({ id }) => id === 'kael-token')?.onTurn).toBe(true);
      expect(views.find(({ id }) => id === LYRA_ID)?.onTurn).toBe(false);
    });

    it('picking a row of the tracker selects the token and brings it into view', async () => {
      await renderCombatRoom();
      await userEvent.click(screen.getByRole('button', { name: 'Lyra' }));
      expect(
        deps.boardRenderers.latest().lastView?.tokens.find(({ id }) => id === LYRA_ID)?.selected,
      ).toBe(true);
      expect(deps.boardRenderers.latest().centered.at(-1)).toEqual({ col: 3, row: 4 });
    });

    it('a turn that changes says "Vez de Lyra." on the status line', async () => {
      await renderCombatRoom();
      deps.tableSessionApi.emit({
        kind: 'boardEvent',
        event: eventAt(5, {
          type: 'combatTurnChanged',
          payload: {
            combat: vharnCombat({ currentCombatantId: LYRA_COMBATANT }),
            conditionChanges: [],
          },
        }),
      });
      expect(boardStatus()).toHaveTextContent('Vez de Lyra.');
    });
  });

  describe('on a phone', () => {
    emulateViewport('mobile');

    it('the panel is not beside the board but in a sheet opened by "Painel"', async () => {
      renderRoom();
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByRole('tab', { name: 'Combate' })).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'Painel' }));
      const sheet = await screen.findByRole('dialog', { name: 'Painel da mesa' });
      expect(within(sheet).getByRole('tab', { name: 'Combate' })).toBeInTheDocument();
    });
  });
});
