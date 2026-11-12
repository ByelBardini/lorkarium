import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { cell } from '@lorkarium/game-core';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import type { OpenTable } from '@/stores/open-tables-store';
import { GROUP_TAB } from '@/stores/scene-tabs-store';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { detailOf, VHARN } from '../../support/campaigns-api-fake';
import { charactersSynced, lyraCharacter } from '../../support/character-fixtures';
import { documentFixture } from '../../support/documents-fixtures';
import { chatSent } from '../../support/chat-fixtures';
import { biaRolled } from '../../support/dice-fixtures';
import { emulateViewport } from '../../support/viewport';
import type { ChatWindowFake } from '../../support/chat-window-host-fake';
import { TORRE_SCENE, torreBoard } from '../../support/scene-tab-fixtures';
import {
  KAEL_COMBATANT,
  KAEL_ID,
  LYRA_ID,
  VHARN_SCENE,
  kael,
  lyra,
  soloCombatant,
  vharnBoard,
  vharnCombat,
  vharnState,
} from '../../support/table-session-fixtures';

const UNLOADED_GRID = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';

describe('play room: grid tabs', () => {
  let deps: TestDependencies;
  let table: OpenTable;

  beforeEach(async () => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
    const router = createMemoryRouter(buildRoutes(deps), {
      initialEntries: [`/campaigns/${VHARN.id}/table`],
    });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1 });
    deps.tableSessionApi.emit(
      { kind: 'state', state: vharnState() },
      { kind: 'status', status: 'live' },
      { kind: 'board', state: vharnBoard({ tokens: [lyra()] }) },
    );
    await act(() => Promise.resolve());
    const [open] = deps.openTables.getState().tables;
    if (!open) throw new Error('VHARN did not open');
    table = open;
  });

  // The Torre open (and shown) as an extra tab, with Kael on turn in round 3.
  async function showTorre(): Promise<void> {
    act(() => table.tabs.getState().open(TORRE_SCENE.id));
    const combat = vharnCombat({
      round: 3,
      currentCombatantId: KAEL_COMBATANT,
      combatants: [soloCombatant(KAEL_COMBATANT, KAEL_ID, 18, 0)],
    });
    deps.tableSessionApi.emitToGrid(TORRE_SCENE.id, {
      kind: 'board',
      state: torreBoard({ tokens: [kael()], combat }),
    });
    await act(() => Promise.resolve());
  }

  function header(): HTMLElement {
    return screen.getByRole('region', { name: 'Topo da sala' });
  }

  async function createToken(name: string): Promise<void> {
    await userEvent.click(screen.getByRole('button', { name: 'Novo token' }));
    const dialog = await screen.findByRole('dialog', { name: 'Novo token' });
    await userEvent.type(within(dialog).getByLabelText('Nome'), name);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar token' }));
  }

  it('the top bar has the open grids and "Biblioteca", which leads to the library of the table', async () => {
    await showTorre();
    const tabs = within(header()).getByRole('tablist', { name: 'Grids abertos' });
    expect(within(tabs).getAllByRole('tab')).toHaveLength(2);
    expect(within(header()).getByRole('link', { name: 'Biblioteca' })).toHaveAttribute(
      'href',
      `/campaigns/${VHARN.id}/table/library`,
    );
  });

  it('a document tab keeps the board mounted and blocks its tools and global shortcuts until a grid is selected', async () => {
    const renderer = deps.boardRenderers.latest();
    const interaction = table.tabs.getState().tabs[0]!.interaction;
    await act(async () => {
      deps.documentWorkspace
        .getState()
        .open({ campaign: detailOf(VHARN), document: documentFixture() });
    });
    expect(await screen.findByRole('textbox', { name: 'Nome do documento' })).toHaveValue('Carta');
    expect(screen.getByRole('tab', { name: 'Carta' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('application')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('toolbar', { name: 'Ferramentas do tabuleiro' }),
    ).not.toBeInTheDocument();
    expect(renderer.destroyed).toBe(false);
    expect(deps.boardRenderers.latest()).toBe(renderer);
    fireEvent.keyDown(window, { key: 'b' });
    fireEvent.keyDown(window, { key: 'f' });
    expect(interaction.getState().tool).toBe('select');
    expect(deps.roomLayout.getState().focus).toBe(false);
    await userEvent.click(screen.getByRole('tab', { name: /Cena 1/ }));
    expect(screen.getByRole('application')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Nome do documento' })).not.toBeInTheDocument();
    expect(deps.documentWorkspace.getState().entries).toHaveLength(1);
    expect(deps.boardRenderers.latest()).toBe(renderer);
    act(() => deps.documentWorkspace.getState().clear());
  });

  it('the board stops drawing while a document covers it, and starts again once a grid is back', async () => {
    const renderer = deps.boardRenderers.latest();
    await act(async () => {
      deps.documentWorkspace
        .getState()
        .open({ campaign: detailOf(VHARN), document: documentFixture() });
    });
    const covered = [...renderer.pauses];
    await userEvent.click(screen.getByRole('tab', { name: /Cena 1/ }));

    expect(covered).toEqual(['pause']);
    expect(renderer.pauses).toEqual(['pause', 'resume']);
    act(() => deps.documentWorkspace.getState().clear());
  });

  it('an active document keeps the tab strip accessible while the board is in focus mode', async () => {
    act(() => deps.roomLayout.getState().toggleFocus());
    expect(screen.queryByRole('region', { name: 'Topo da sala' })).not.toBeInTheDocument();
    await act(async () => {
      deps.documentWorkspace
        .getState()
        .open({ campaign: detailOf(VHARN), document: documentFixture() });
    });
    expect(await screen.findByRole('tab', { name: 'Carta' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('region', { name: 'Topo da sala' })).toBeInTheDocument();
    act(() => deps.documentWorkspace.getState().clear());
  });

  it('showing a tab puts its grid on the canvas, and the group tab brings the group grid back', async () => {
    await showTorre();
    expect(screen.getByRole('application')).toHaveAccessibleName('Tabuleiro: Torre, 16 × 16 casas');
    await userEvent.click(screen.getByRole('tab', { name: /Cena 1/ }));
    expect(screen.getByRole('application')).toHaveAccessibleName(
      'Tabuleiro: Cena 1, 20 × 12 casas',
    );
  });

  describe('one renderer for every grid tab', () => {
    const TORRE_CAMERA = { offsetX: -40, offsetY: 12, zoom: 2 };
    const GROUP_CAMERA = { offsetX: 8, offsetY: -16, zoom: 0.5 };

    function showTab(key: string): void {
      act(() => table.tabs.getState().show(key));
    }

    it('group → Torre → group mounts one renderer and destroys none', async () => {
      await showTorre();
      showTab(GROUP_TAB);
      showTab(TORRE_SCENE.id);

      expect(deps.boardRenderers.calls).toBe(1);
      expect(deps.boardRenderers.alive).toHaveLength(1);
      expect(deps.boardRenderers.latest().lastView?.tokens.map(({ id }) => id)).toEqual([KAEL_ID]);
    });

    it('each tab opens at its own camera; a grid never shown before fits its scene', async () => {
      const renderer = deps.boardRenderers.latest();
      renderer.cameraNow = GROUP_CAMERA;
      await showTorre();
      renderer.cameraNow = TORRE_CAMERA;
      showTab(GROUP_TAB);
      showTab(TORRE_SCENE.id);

      expect(renderer.resets).toEqual([undefined, GROUP_CAMERA, TORRE_CAMERA]);
    });

    it('a drag cancelled by the switch goes to the tab it started on', async () => {
      const renderer = deps.boardRenderers.latest();
      renderer.emit({
        kind: 'tokenDragged',
        tokenId: LYRA_ID,
        origin: cell(3, 4),
        cell: cell(5, 4),
      });
      const group = table.tabs.getState().tabs[0];
      const dragging = group?.interaction.getState().drag;
      renderer.saysOnReset = [{ kind: 'tokenDragCancelled', tokenId: LYRA_ID }];

      await showTorre();

      expect(dragging).not.toBeNull();
      expect(group?.interaction.getState().drag).toBeNull();
    });

    it('a lost context on a tab mounts one renderer more, which the next tab keeps', async () => {
      await showTorre();
      deps.boardRenderers.latest().lose();
      await act(() => Promise.resolve());
      showTab(GROUP_TAB);

      expect(deps.boardRenderers.calls).toBe(2);
      expect(deps.boardRenderers.alive).toHaveLength(1);
      expect(deps.boardRenderers.latest().resets).toHaveLength(1);
    });

    it('a tab still loading hides the canvas and keeps its renderer', () => {
      act(() => table.tabs.getState().open(UNLOADED_GRID));

      expect(screen.queryByRole('application')).toBeNull();
      expect(deps.boardRenderers.alive).toHaveLength(1);
      expect(deps.boardRenderers.latest().resets).toEqual([undefined]);
    });

    it('leaving the room destroys the renderer', async () => {
      await showTorre();

      cleanup();

      expect(deps.boardRenderers.made.map(({ destroyed }) => destroyed)).toEqual([true]);
    });
  });

  it('the turn line and the tracker follow the tab shown', async () => {
    await showTorre();
    expect(within(header()).getByText('Rodada 3 · Vez de Kael')).toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: 'Combate' })).toHaveTextContent('Kael');
    await userEvent.click(screen.getByRole('tab', { name: /Cena 1/ }));
    expect(within(header()).queryByText('Rodada 3 · Vez de Kael')).toBeNull();
    expect(screen.getByRole('tabpanel', { name: 'Combate' })).toHaveTextContent('Fora de combate');
  });

  it('the token dock shows the token picked on the grid of the tab shown', async () => {
    await showTorre();
    deps.boardRenderers.latest().emit({ kind: 'tokenPicked', tokenId: KAEL_ID, additive: false });
    expect(screen.getByRole('region', { name: 'Token selecionado' })).toHaveTextContent('Kael');
  });

  it('commands go to the grid of the tab shown', async () => {
    await showTorre();
    await createToken('Baú');
    await userEvent.click(screen.getByRole('tab', { name: /Cena 1/ }));
    await createToken('Arca');
    expect(deps.boardCommands.sentAs('createToken').map(({ sceneId }) => sceneId)).toEqual([
      TORRE_SCENE.id,
      VHARN_SCENE.id,
    ]);
  });

  it('"Na mesa" keeps showing the group grid while another tab is still loading', async () => {
    deps.tableSessionApi.emitToCharacters(VHARN.id, charactersSynced(3, lyraCharacter()));
    act(() => table.tabs.getState().open(UNLOADED_GRID));
    await userEvent.click(screen.getByRole('tab', { name: 'Na mesa' }));
    const people = screen.getByRole('tabpanel', { name: 'Na mesa' });
    expect(within(people).getAllByRole('textbox').length).toBeGreaterThan(0);
  });

  it('"Dados" holds the tray and the history of the table, whatever grid tab is shown', async () => {
    await userEvent.click(screen.getByRole('tab', { name: 'Dados' }));
    const dice = screen.getByRole('tabpanel', { name: 'Dados' });
    expect(within(dice).getByRole('button', { name: 'Rolar' })).toBeInTheDocument();
    deps.tableSessionApi.emit({ kind: 'diceRolled', event: biaRolled() });
    const history = within(dice).getByRole('list', { name: 'Histórico de rolagens' });
    expect(within(history).getByText('Acerto')).toBeInTheDocument();
  });

  it('a revealed roll shows over the board, with "Dados" closed and another grid shown', async () => {
    await showTorre();
    deps.tableSessionApi.emit({ kind: 'diceRolled', event: biaRolled() });
    expect(screen.queryByTestId('dice-roll-notice')).toBeNull();
    act(() => deps.diceClock.advance(2400));
    const notice = screen.getByTestId('dice-roll-notice');
    expect(within(notice).getByText('Bia rolou · Acerto')).toBeInTheDocument();
    expect(within(notice).getByText('22')).toBeInTheDocument();
    const saying = [...document.querySelectorAll('[aria-live]')].filter((region) =>
      region.textContent?.includes('Bia rolou 22 (Acerto).'),
    );
    expect(saying).toHaveLength(1);
  });

  it('while reconnecting the tabs stay and the tab shown sends nothing', async () => {
    await showTorre();
    deps.tableSessionApi.emit({ kind: 'status', status: 'reconnecting' });
    expect(within(header()).getAllByRole('tab')).toHaveLength(2);
    expect(deps.boardRenderers.latest().lastView?.tokens[0]?.draggable).toBe(false);
  });
});

describe('play room: the chat at the foot of the board', () => {
  let deps: TestDependencies;

  beforeEach(async () => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
    const router = createMemoryRouter(buildRoutes(deps), {
      initialEntries: [`/campaigns/${VHARN.id}/table`],
    });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1 });
    deps.tableSessionApi.emit(
      { kind: 'state', state: vharnState() },
      { kind: 'status', status: 'live' },
      { kind: 'board', state: vharnBoard({ tokens: [lyra()] }) },
    );
    await act(() => Promise.resolve());
  });

  function bar(): HTMLElement {
    return screen.getByRole('region', { name: 'Chat da mesa' });
  }

  function drawer(): HTMLElement {
    return screen.getByRole('region', { name: 'Conversa' });
  }

  async function openChat(): Promise<void> {
    await userEvent.click(within(bar()).getByRole('button', { name: 'Abrir chat' }));
  }

  async function detachChat(): Promise<ChatWindowFake> {
    await openChat();
    await userEvent.click(within(drawer()).getByRole('button', { name: 'Abrir em outra janela' }));
    const popup = deps.chatWindowHost.last();
    popup.load();
    await waitFor(() => expect(within(popup.document.body).getByRole('log')).toBeInTheDocument());
    return popup;
  }

  it('the side panel has only "Combate", "Na mesa" and "Dados"', () => {
    const panel = screen.getByRole('complementary', { name: 'Painel da mesa' });
    const tabs = within(panel).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent?.replace(/\d+$/, ''))).toEqual([
      'Combate',
      'Na mesa',
      'Dados',
    ]);
  });

  it('the "Chat da mesa" bar opens a drawer that sends to the table', async () => {
    await openChat();
    await userEvent.type(
      within(drawer()).getByRole('combobox', { name: 'Mensagem' }),
      'Oi!{Enter}',
    );
    expect(deps.chat.sent.map(({ request }) => request.text)).toEqual(['Oi!']);
  });

  it('a message while the panel shows "Dados" is counted on the bar', async () => {
    await userEvent.click(screen.getByRole('tab', { name: 'Dados' }));
    deps.tableSessionApi.emit({ kind: 'chatSent', event: chatSent() });
    expect(within(bar()).getByRole('button', { name: 'Abrir chat' })).toHaveAccessibleDescription(
      '1 mensagem não lida',
    );
  });

  it('with the panel collapsed, "Abrir painel" carries no chat count: the bar does', async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Recolher painel' }));
    deps.tableSessionApi.emit({ kind: 'chatSent', event: chatSent() });
    expect(screen.getByRole('button', { name: 'Abrir painel' })).not.toHaveAccessibleDescription();
    expect(within(bar()).getByRole('button', { name: 'Abrir chat' })).toHaveAccessibleDescription(
      '1 mensagem não lida',
    );
  });

  it('focus mode (F) hides the toolbar and the panel, and keeps the bar', () => {
    fireEvent.keyDown(window, { key: 'f' });
    expect(screen.queryByRole('toolbar', { name: 'Ferramentas do tabuleiro' })).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Painel da mesa' })).toBeNull();
    expect(bar()).toBeInTheDocument();
  });

  it('the browser tab counts the unread messages, and goes back to the plain title once read', async () => {
    expect(document.title).toBe('Lorkarium · Os Sinos de Vharn');
    deps.tableSessionApi.emit({ kind: 'chatSent', event: chatSent() });
    expect(document.title).toBe('(1) Lorkarium · Os Sinos de Vharn');
    await openChat();
    expect(document.title).toBe('Lorkarium · Os Sinos de Vharn');
  });

  it('Esc with the focus in the drawer closes only the drawer, and focus mode stays', async () => {
    fireEvent.keyDown(window, { key: 'f' });
    await openChat();
    expect(within(drawer()).getByRole('combobox', { name: 'Mensagem' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Conversa' })).toBeNull();
    expect(deps.roomLayout.getState()).toMatchObject({ focus: true, chat: 'closed' });
  });

  it('Esc on the board still leaves focus mode, and the open drawer stays', async () => {
    fireEvent.keyDown(window, { key: 'f' });
    await openChat();
    act(() => screen.getByRole('application').focus());
    await userEvent.keyboard('{Escape}');
    expect(deps.roomLayout.getState()).toMatchObject({ focus: false, chat: 'open' });
    expect(drawer()).toBeInTheDocument();
  });

  it('a whisper to the viewer rings the chat sound once', () => {
    const whisper = chatSent({ channel: { kind: 'table', whisperTo: ANA.id }, text: 'Só você.' });
    deps.tableSessionApi.emit({ kind: 'chatSent', event: whisper });
    expect(deps.chatSounds.latest().plays).toBe(1);
  });

  it('dice and chat open independent windows, keep rolling across tabs, and dock after closing', async () => {
    await userEvent.click(screen.getByRole('tab', { name: 'Dados' }));
    await userEvent.click(screen.getByRole('button', { name: 'Abrir em outra janela' }));
    const dicePopup = deps.chatWindowHost.last();
    dicePopup.load();
    await waitFor(() =>
      expect(within(dicePopup.document.body).getByLabelText('Fórmula')).toBeInTheDocument(),
    );
    expect(deps.chatWindowHost.calls.at(-1)?.url).toBe('/chat-window.html?panel=dice');
    expect(dicePopup.document.title).toBe('Dados · Lorkarium');
    const chatPopup = await detachChat();
    expect(deps.chatWindowHost.calls[0]?.name).not.toBe(deps.chatWindowHost.calls[1]?.name);
    await userEvent.type(within(dicePopup.document.body).getByLabelText('Fórmula'), '1d20');
    await userEvent.click(within(dicePopup.document.body).getByRole('button', { name: 'Rolar' }));
    expect(deps.dice.sent).toHaveLength(1);
    dicePopup.closeByUser();
    await waitFor(() => expect(screen.getByLabelText('Fórmula')).toBeInTheDocument());
    expect(chatPopup.closed).toBe(false);
  });

  it('the detached chat sends and receives through its window, and the bar brings it back', async () => {
    const popup = await detachChat();
    expect(within(bar()).getByText('Chat aberto em outra janela')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Dados' }));
    deps.tableSessionApi.emit({ kind: 'chatSent', event: chatSent() });
    expect(within(popup.document.body).getByRole('log')).toHaveTextContent('Oi, mesa.');
    expect(document.title).toBe('Lorkarium · Os Sinos de Vharn');
    await userEvent.type(
      within(popup.document.body).getByRole('combobox', { name: 'Mensagem' }),
      'Da janela.{Enter}',
    );
    expect(deps.chat.sent.at(-1)?.request.text).toBe('Da janela.');
    await userEvent.click(within(bar()).getByRole('button', { name: 'Trazer de volta' }));
    expect(popup.closed).toBe(true);
    expect(within(drawer()).getByRole('log')).toHaveTextContent('Oi, mesa.');
  });

  it('a character’s line at the Table goes to the board shown as a balloon', () => {
    const speaker = {
      kind: 'token' as const,
      sceneId: VHARN_SCENE.id,
      tokenId: LYRA_ID,
      name: 'Lyra',
    };
    deps.tableSessionApi.emit({ kind: 'chatSent', event: chatSent({ speaker }) });
    const handed = deps.boardRenderers.latest().speeches.at(-1);
    expect(handed?.sceneId).toBe(VHARN_SCENE.id);
    expect(handed?.balloons.map(({ tokenId, text }) => ({ tokenId, text }))).toEqual([
      { tokenId: LYRA_ID, text: 'Oi, mesa.' },
    ]);
  });
});

describe('play room on a phone: the "Chat" button', () => {
  emulateViewport('mobile');

  it('focus mode (F) hides "Painel" and keeps "Chat" with its count, with no chat bar', async () => {
    const deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
    const router = createMemoryRouter(buildRoutes(deps), {
      initialEntries: [`/campaigns/${VHARN.id}/table`],
    });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1 });
    deps.tableSessionApi.emit({ kind: 'state', state: vharnState() });
    deps.tableSessionApi.emit({ kind: 'chatSent', event: chatSent() });
    fireEvent.keyDown(window, { key: 'f' });
    expect(screen.queryByRole('button', { name: 'Painel' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Chat' })).toHaveAccessibleDescription(
      '1 mensagem não lida',
    );
    expect(screen.queryByRole('region', { name: 'Chat da mesa' })).toBeNull();
  });
});
