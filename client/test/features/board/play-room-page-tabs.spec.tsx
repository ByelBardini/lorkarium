import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import type { OpenTable } from '@/stores/open-tables-store';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { chatSent } from '../../support/chat-fixtures';
import { biaRolled } from '../../support/dice-fixtures';
import { emulateViewport } from '../../support/viewport';
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

  it('showing a tab puts its grid on the canvas, and the group tab brings the group grid back', async () => {
    await showTorre();
    expect(screen.getByRole('application')).toHaveAccessibleName('Tabuleiro: Torre, 16 × 16 casas');
    await userEvent.click(screen.getByRole('tab', { name: /Cena 1/ }));
    expect(screen.getByRole('application')).toHaveAccessibleName(
      'Tabuleiro: Cena 1, 20 × 12 casas',
    );
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

describe('play room: the "Chat" tab and its counter', () => {
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

  it('"Chat" holds the conversations of the table and sends from there', async () => {
    await userEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    const chat = screen.getByRole('tabpanel', { name: 'Chat' });
    await userEvent.type(within(chat).getByRole('combobox', { name: 'Mensagem' }), 'Oi!{Enter}');
    expect(deps.chat.sent.map(({ request }) => request.text)).toEqual(['Oi!']);
  });

  it('the separate chat stays live after switching tabs and returns when brought back', async () => {
    await userEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    await userEvent.click(screen.getByRole('button', { name: 'Abrir em outra janela' }));
    const popup = deps.chatWindowHost.last();
    popup.load();
    await waitFor(() => expect(within(popup.document.body).getByRole('log')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('tab', { name: 'Dados' }));
    deps.tableSessionApi.emit({ kind: 'chatSent', event: chatSent() });
    expect(within(popup.document.body).getByRole('log')).toHaveTextContent('Oi, mesa.');
    expect(screen.getByRole('tab', { name: 'Chat' })).not.toHaveAccessibleDescription();
    await userEvent.type(
      within(popup.document.body).getByRole('combobox', { name: 'Mensagem' }),
      'Da janela.{Enter}',
    );
    expect(deps.chat.sent.at(-1)?.request.text).toBe('Da janela.');
    await userEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    await userEvent.click(screen.getByRole('button', { name: 'Trazer de volta' }));
    expect(popup.closed).toBe(true);
    expect(screen.getByRole('log')).toHaveTextContent('Oi, mesa.');
  });

  it('a message while "Chat" is not shown is counted on the tab, and showing it clears the count', async () => {
    deps.tableSessionApi.emit({ kind: 'chatSent', event: chatSent() });
    const tab = screen.getByRole('tab', { name: 'Chat' });
    expect(tab).toHaveAccessibleDescription('1 mensagem não lida');
    await userEvent.click(tab);
    expect(screen.getByRole('tab', { name: 'Chat' })).not.toHaveAccessibleDescription();
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

  it('with the panel collapsed, "Abrir painel" carries the count', async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Recolher painel' }));
    deps.tableSessionApi.emit({ kind: 'chatSent', event: chatSent() });
    expect(screen.getByRole('button', { name: 'Abrir painel' })).toHaveAccessibleDescription(
      '1 mensagem não lida',
    );
  });
});

describe('play room on a phone: the chat counter on "Painel"', () => {
  emulateViewport('mobile');

  it('a message is counted on "Painel" while the sheet is closed', async () => {
    const deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
    const router = createMemoryRouter(buildRoutes(deps), {
      initialEntries: [`/campaigns/${VHARN.id}/table`],
    });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1 });
    deps.tableSessionApi.emit({ kind: 'state', state: vharnState() });
    deps.tableSessionApi.emit({ kind: 'chatSent', event: chatSent() });
    expect(screen.getByRole('button', { name: 'Painel' })).toHaveAccessibleDescription(
      '1 mensagem não lida',
    );
  });
});
