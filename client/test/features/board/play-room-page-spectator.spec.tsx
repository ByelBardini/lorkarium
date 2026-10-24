import type {
  AuthUserDto,
  BoardStateDto,
  CampaignRoleDto,
  SessionMemberDto,
} from '@lorkarium/contracts';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cell } from '@lorkarium/game-core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN, detailOf } from '../../support/campaigns-api-fake';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  LYRA_COMBATANT,
  LYRA_ID,
  VHARN_SCENE,
  biaUpdated,
  duda,
  kael,
  lyra,
  vharnBoard,
  vharnCombat,
  vharnState,
} from '../../support/table-session-fixtures';

const DUDA_ID = duda().userId;
const GOBLIN_ID = 'cc33dd44-ee55-4f66-8a77-112233445566';
const OGRE_ID = 'aa11bb22-cc33-4d44-8e55-ff6677889900';
const EDIT_TOOLS = [
  'Desenhar (B)',
  'Área de efeito (M)',
  'Paredes (P)',
  'Luzes (L)',
  'Novo token',
  'Adicionar jogadores',
  'Configurar cena',
];

function accountOf(member: SessionMemberDto): AuthUserDto {
  const { userId: id, username, name } = member;
  return { ...ANA, id, username, name, email: `${username}@mesa.com` };
}

// Lyra is Bia's: as anyone but Bia and the master gets her, no control and no hidden bar.
const LYRA_WATCHED = lyra({ canControl: false, bars: [] });

function boardAs(userId: string, role: CampaignRoleDto, overrides: Partial<BoardStateDto> = {}) {
  return vharnBoard({ viewer: { userId, role }, tokens: [LYRA_WATCHED], ...overrides });
}

describe('play room of a spectator', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
  });

  async function openAs(
    member: SessionMemberDto,
    board: BoardStateDto = boardAs(member.userId, member.role),
  ): Promise<void> {
    deps.authApi.answerMeWith(accountOf(member));
    answerDetailAs(member.role);
    const router = createMemoryRouter(buildRoutes(deps), {
      initialEntries: [`/campaigns/${VHARN.id}/table`],
    });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1 });
    // The viewer has the table open, so the roster lists them as the test passed them (online).
    const members = [ANA_AT_TABLE, BIA_AT_TABLE, CAIO_AT_TABLE, duda()].map((listed) =>
      listed.userId === member.userId ? member : listed,
    );
    deps.tableSessionApi.emit(
      { kind: 'state', state: vharnState({ members }) },
      { kind: 'status', status: 'live' },
      { kind: 'board', state: board },
    );
    await act(() => Promise.resolve());
  }

  function answerDetailAs(role: CampaignRoleDto): void {
    const value = detailOf(VHARN, { myRole: role, joinCode: null });
    deps.campaignsApi.answer('detail', { ok: true, value });
  }

  function roomHeader(): HTMLElement {
    return screen.getByRole('region', { name: 'Topo da sala' });
  }

  function toolbar(): HTMLElement {
    return screen.getByRole('toolbar', { name: 'Ferramentas do tabuleiro' });
  }

  function boardStatus(): HTMLElement {
    return screen.getByRole('status', { name: 'Status do tabuleiro' });
  }

  function lastView() {
    return deps.boardRenderers.latest().lastView;
  }

  function selectLyra(): void {
    act(() =>
      deps.boardRenderers.latest().emit({ kind: 'tokenPicked', tokenId: LYRA_ID, additive: false }),
    );
  }

  describe('Duda watches without tools', () => {
    beforeEach(() => openAs(duda()));

    it('the top bar shows the "Espectador" badge', () => {
      expect(within(roomHeader()).getByText('Espectador')).toBeInTheDocument();
    });

    it('the toolbar keeps Selecionar and Régua, with no edit tool, token, scene or layer', () => {
      expect(within(toolbar()).getByRole('button', { name: 'Selecionar (V)' })).toBeInTheDocument();
      expect(within(toolbar()).getByRole('button', { name: 'Régua (R)' })).toBeInTheDocument();
      for (const name of EDIT_TOOLS) {
        expect(within(toolbar()).queryByRole('button', { name })).toBeNull();
      }
      expect(within(toolbar()).queryByRole('group', { name: 'Camada' })).toBeNull();
    });

    it('B and M pick nothing: Selecionar stays pressed', async () => {
      await userEvent.keyboard('bm');
      expect(within(toolbar()).getByRole('button', { name: 'Selecionar (V)' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('the ruler still measures, locally', async () => {
      await userEvent.keyboard('r');
      deps.boardRenderers.latest().emit({ kind: 'pointerDown', cell: cell(0, 0) });
      deps.boardRenderers.latest().emit({ kind: 'pointerMove', cell: cell(3, 2) });
      expect(lastView()?.ruler?.label).toBe('3 casas · 4,5 m');
      expect(deps.boardCommands.sent).toEqual([]);
    });

    it('Lyra is not draggable, and a drop sends nothing', () => {
      expect(lastView()?.tokens[0]?.draggable).toBe(false);
      deps.boardRenderers
        .latest()
        .emit({ kind: 'tokenDropped', tokenId: LYRA_ID, cell: cell(8, 6) });
      expect(deps.boardCommands.sent).toEqual([]);
    });

    it('the arrows with Lyra selected send nothing and say nothing', async () => {
      selectLyra();
      screen.getByRole('application').focus();
      await userEvent.keyboard('{ArrowRight}{ArrowUp}eq');
      expect(deps.boardCommands.sent).toEqual([]);
      expect(boardStatus()).not.toHaveTextContent('Esse token não é seu.');
    });

    it('Alt + click (a ping) is neither drawn nor sent', async () => {
      deps.boardRenderers.latest().emit({ kind: 'pingRequested', x: 5.5, y: 2.2 });
      await act(() => Promise.resolve());
      expect(deps.boardRenderers.latest().pings).toEqual([]);
      expect(deps.pings.sent).toEqual([]);
    });

    it('Ctrl+C, Ctrl+V, Ctrl+Z and Delete do nothing', async () => {
      selectLyra();
      deps.boardRenderers.latest().emit({ kind: 'pointerMove', cell: cell(9, 5) });
      await userEvent.keyboard('{Control>}c{/Control}');
      expect(boardStatus()).not.toHaveTextContent('1 item copiado.');
      await userEvent.keyboard('{Control>}v{/Control}{Control>}z{/Control}');
      screen.getByRole('application').focus();
      await userEvent.keyboard('{Delete}');
      expect(deps.boardCommands.sent).toEqual([]);
    });

    it('a right click on Lyra opens no token menu', () => {
      act(() =>
        deps.boardRenderers
          .latest()
          .emit({ kind: 'tokenMenuRequested', tokenId: LYRA_ID, x: 40, y: 40 }),
      );
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('out of combat there is no "Iniciar combate"', () => {
      expect(screen.getByRole('tabpanel', { name: 'Combate' })).toHaveTextContent(
        'Fora de combate',
      );
      expect(screen.queryByRole('button', { name: /Iniciar combate/ })).toBeNull();
    });

    it('Bia\'s card in "Na mesa" is read only: no pencil', async () => {
      await userEvent.click(screen.getByRole('tab', { name: 'Na mesa' }));
      const panel = screen.getByRole('region', { name: 'Na mesa' });
      expect(within(panel).getAllByText('Bia').length).toBeGreaterThan(0);
      expect(within(panel).queryByRole('button', { name: /^Mudar o nome de/ })).toBeNull();
    });
  });

  it("in combat on Lyra's turn, Duda gets no turn controls", async () => {
    const combat = vharnCombat({ currentCombatantId: LYRA_COMBATANT });
    await openAs(duda(), boardAs(DUDA_ID, 'spectator', { combat }));
    const turn = screen.getByRole('region', { name: 'Combate em andamento' });
    for (const name of [/Passar a vez/, /Próximo turno/, /Fechar rodada/, 'Turno anterior']) {
      expect(within(turn).queryByRole('button', { name })).toBeNull();
    }
  });

  describe('Duda in the dark looks through the players’ tokens', () => {
    // Bia's Lyra at (3, 4) sees 3 cells fully and 3 more dimly; the goblin is by her, the ogre
    // far from every player token.
    const lit = { sight: { bright: 3, dim: 3 } };
    const goblin = kael({ id: GOBLIN_ID, name: 'Goblin', controllerIds: [], canControl: false });
    const ogre = kael({ id: OGRE_ID, name: 'Ogro', controllerIds: [], canControl: false, col: 16 });
    const dark = { ...VHARN_SCENE, vision: 'dark' as const };

    it('the goblin by Lyra shows and the far ogre does not', async () => {
      const tokens = [lyra({ ...lit, canControl: false, bars: [] }), goblin, ogre];
      await openAs(duda(), boardAs(DUDA_ID, 'spectator', { scene: dark, tokens }));
      const shown = lastView()?.tokens.map(({ id }) => id);
      expect(shown).toEqual(expect.arrayContaining([LYRA_ID, GOBLIN_ID]));
      expect(shown).not.toContain(OGRE_ID);
    });

    it('with no player token on the scene, the line says "Nenhum token de jogador nesta cena."', async () => {
      await openAs(duda(), boardAs(DUDA_ID, 'spectator', { scene: dark, tokens: [goblin] }));
      expect(boardStatus()).toHaveTextContent('Nenhum token de jogador nesta cena.');
    });
  });

  describe('the own role changed live', () => {
    it('Duda promoted: the badge goes, the player tools come and the line says so', async () => {
      await openAs(duda());
      const resyncs = deps.tableSessionApi.resyncedIds.length;
      answerDetailAs('player');
      deps.tableSessionApi.emit({
        kind: 'memberUpdated',
        event: biaUpdated({ member: duda({ role: 'player' }) }),
      });
      await waitFor(() =>
        expect(within(toolbar()).getByRole('button', { name: 'Desenhar (B)' })).toBeInTheDocument(),
      );
      expect(within(roomHeader()).queryByText('Espectador')).toBeNull();
      expect(boardStatus()).toHaveTextContent('Agora você é jogador nesta mesa.');
      expect(deps.tableSessionApi.resyncedIds.slice(resyncs)).toEqual([VHARN.id]);
    });

    it('Bia demoted: the tools go, the badge comes and the line says so', async () => {
      const bia = { ...BIA_AT_TABLE, online: true };
      await openAs(bia, boardAs(bia.userId, 'player', { tokens: [lyra()] }));
      expect(within(toolbar()).getByRole('button', { name: 'Desenhar (B)' })).toBeInTheDocument();
      answerDetailAs('spectator');
      deps.tableSessionApi.emit({
        kind: 'memberUpdated',
        event: biaUpdated({ member: { ...bia, role: 'spectator' } }),
      });
      await waitFor(() => expect(within(roomHeader()).getByText('Espectador')).toBeInTheDocument());
      expect(within(toolbar()).queryByRole('button', { name: 'Desenhar (B)' })).toBeNull();
      expect(boardStatus()).toHaveTextContent('Agora você assiste a esta mesa.');
    });
  });
});
