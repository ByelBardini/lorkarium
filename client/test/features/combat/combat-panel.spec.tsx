import type { BoardStateDto } from '@lorkarium/contracts';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { CombatPanel } from '@/features/combat/combat-panel';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createTablePresenceStore, type TablePresenceStore } from '@/stores/table-presence-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  KAEL_COMBATANT,
  LYRA_COMBATANT,
  VHARN_SCENE,
  activeCondition,
  eventAt,
  kael,
  lyra,
  soloCombatant,
  vharnBoard,
  vharnCombat,
  VHARN_GRID,
} from '../../support/table-session-fixtures';

const KAEL = kael({ id: 'kael-token' });
const LYRA = lyra();
const LOBO = lyra({ id: 'lobo-token', name: 'Lobo', side: 'enemy', controllerIds: [] });

describe('CombatPanel', () => {
  let board: StoreApi<BoardStore>;
  let presence: StoreApi<TablePresenceStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    presence = createTablePresenceStore(VHARN.id);
    presence.setState({ members: [ANA_AT_TABLE, BIA_AT_TABLE] });
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: (failure) =>
        failure === 'combat_active' ? 'Já há um combate nesta cena.' : failure,
    });
  });

  function renderPanel(state: Partial<BoardStateDto> = {}, isMaster = true): void {
    board
      .getState()
      .apply({ kind: 'board', state: vharnBoard({ tokens: [KAEL, LYRA], ...state }) });
    render(
      <CombatPanel
        table={{ board, presence }}
        interaction={interaction}
        isMaster={isMaster}
        onEditToken={() => undefined}
      />,
    );
  }

  const startButton = () => screen.getByRole('button', { name: 'Começar combate' });

  async function prepareWithKael18(): Promise<void> {
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar combate' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Iniciativa de Kael' }), '18');
  }

  describe('out of combat → preparation → combat', () => {
    it('"Iniciar combate" swaps the scene for the preparation, in the panel', async () => {
      renderPanel();
      expect(screen.getByRole('list', { name: 'Na cena' })).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Iniciar combate' }));

      expect(screen.getByRole('heading', { name: 'Quem entra na briga?' })).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Na cena' })).toBeNull();
    });

    it('"Começar combate" sends one combat:start with the initiatives typed', async () => {
      renderPanel();
      await prepareWithKael18();

      await userEvent.click(startButton());

      expect(commands.sentAs('startCombat')).toEqual([
        {
          name: 'startCombat',
          ...VHARN_GRID,
          fields: {
            entries: [
              { name: null, tokenIds: ['kael-token'], initiative: 18 },
              { name: null, tokenIds: [LYRA.id], initiative: null },
            ],
          },
        },
      ]);
    });

    it('confirmed and combat:started arriving, the tab shows the combat', async () => {
      renderPanel();
      await prepareWithKael18();
      await userEvent.click(startButton());

      act(() =>
        board.getState().apply({
          kind: 'boardEvent',
          event: eventAt(5, { type: 'combatStarted', payload: { combat: vharnCombat() } }),
        }),
      );

      expect(screen.getByRole('region', { name: 'Combate em andamento' })).toBeInTheDocument();
      expect(screen.getByRole('list', { name: 'Ordem de iniciativa' })).toBeInTheDocument();
    });

    it('a refused start (COMBAT_ALREADY_ACTIVE) says so and keeps the preparation with what was typed', async () => {
      commands.answerWith({ ok: false, failure: 'combat_active' });
      renderPanel();
      await prepareWithKael18();

      await userEvent.click(startButton());

      expect(interaction.getState().notice).toBe('Já há um combate nesta cena.');
      expect(screen.getByRole('textbox', { name: 'Iniciativa de Kael' })).toHaveValue('18');
    });

    it('"Cancelar" goes back to the scene without sending anything', async () => {
      renderPanel();
      await prepareWithKael18();

      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(screen.getByRole('list', { name: 'Na cena' })).toBeInTheDocument();
      expect(commands.sent).toEqual([]);
    });

    it('disconnected, "Começar combate" is off', async () => {
      renderPanel();
      await userEvent.click(screen.getByRole('button', { name: 'Iniciar combate' }));

      act(() => interaction.getState().setReadOnly(true));

      expect(startButton()).toBeDisabled();
    });
  });

  describe('adding in the middle of the fight', () => {
    const inCombat = () => ({
      tokens: [KAEL, LYRA, LOBO],
      combat: vharnCombat({
        combatants: [soloCombatant(KAEL_COMBATANT, 'kael-token', 18, 0)],
      }),
    });

    async function chooseFrom(item: string): Promise<void> {
      await userEvent.click(screen.getByRole('button', { name: 'Mais opções do combate' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: item }));
    }

    it('"Adicionar ao combate" opens the preparation with only who is out', async () => {
      renderPanel(inCombat());

      await chooseFrom('Adicionar ao combate');

      expect(screen.getByRole('heading', { name: 'Adicionar ao combate' })).toBeInTheDocument();
      expect(screen.queryByRole('checkbox', { name: 'Incluir Kael' })).toBeNull();
      expect(screen.getByRole('checkbox', { name: 'Incluir Lobo' })).toBeChecked();
    });

    it('"Adicionar" sends one combat:addCombatants with the initiatives', async () => {
      renderPanel(inCombat());
      await chooseFrom('Adicionar ao combate');
      await userEvent.type(screen.getByRole('textbox', { name: 'Iniciativa de Lobo' }), '12');
      await userEvent.click(screen.getByRole('checkbox', { name: 'Incluir Lyra' }));

      await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

      expect(commands.sentAs('addCombatants').map(({ fields }) => fields)).toEqual([
        { entries: [{ name: null, tokenIds: ['lobo-token'], initiative: 12 }] },
      ]);
      expect(screen.queryByRole('heading', { name: 'Adicionar ao combate' })).toBeNull();
    });

    it('"Entrada sem token" named Covil with 20 sends addCombatants with no token', async () => {
      renderPanel(inCombat());
      await chooseFrom('Entrada sem token');

      await userEvent.type(screen.getByRole('textbox', { name: 'Nome da entrada' }), 'Covil');
      await userEvent.type(screen.getByRole('textbox', { name: 'Iniciativa' }), '20');
      await userEvent.click(screen.getByRole('button', { name: 'Criar entrada' }));

      expect(commands.sentAs('addCombatants').map(({ fields }) => fields)).toEqual([
        { entries: [{ name: 'Covil', tokenIds: [], initiative: 20 }] },
      ]);
      expect(screen.queryByRole('form', { name: 'Entrada sem token' })).toBeNull();
    });

    it('without a name the entry is not sent', async () => {
      renderPanel(inCombat());
      await chooseFrom('Entrada sem token');

      expect(screen.getByRole('button', { name: 'Criar entrada' })).toBeDisabled();
      expect(commands.sent).toEqual([]);
    });

    it('a refused entry keeps the form with the name', async () => {
      commands.answerWith({ ok: false, failure: 'forbidden' });
      renderPanel(inCombat());
      await chooseFrom('Entrada sem token');
      await userEvent.type(screen.getByRole('textbox', { name: 'Nome da entrada' }), 'Covil');

      await userEvent.click(screen.getByRole('button', { name: 'Criar entrada' }));

      expect(interaction.getState().notice).toBe('forbidden');
      expect(screen.getByRole('textbox', { name: 'Nome da entrada' })).toHaveValue('Covil');
    });
  });

  describe('what the change of turn told', () => {
    const POISONED = lyra({ conditions: [activeCondition({ remainingRounds: 1 })] });

    function inRound(round: number, currentCombatantId: string) {
      return vharnCombat({ round, currentCombatantId });
    }

    function turnChanged(version: number, round: number, current: string, lyraConditions = []) {
      act(() =>
        board.getState().apply({
          kind: 'boardEvent',
          event: eventAt(version, {
            type: 'combatTurnChanged',
            payload: {
              combat: inRound(round, current),
              conditionChanges: [{ tokenId: LYRA.id, conditions: lyraConditions }],
            },
          }),
        }),
      );
    }

    it('closing round 2 tells "Rodada 3 começou." and the Envenenado that ended on the Lyra', () => {
      renderPanel({ tokens: [KAEL, POISONED], combat: inRound(2, LYRA_COMBATANT) });

      turnChanged(5, 3, KAEL_COMBATANT);

      const told = screen.getByRole('status', { name: 'O que aconteceu' });
      expect(told).toHaveTextContent('Rodada 3 começou.');
      expect(told).toHaveTextContent('Envenenado acabou em Lyra.');
    });

    it('the next turn replaces the lines', () => {
      renderPanel({ tokens: [KAEL, POISONED], combat: inRound(2, LYRA_COMBATANT) });
      turnChanged(5, 3, KAEL_COMBATANT);

      turnChanged(6, 3, LYRA_COMBATANT);

      expect(screen.queryByRole('status', { name: 'O que aconteceu' })).toBeNull();
    });

    it('a snapshot tells nothing', () => {
      renderPanel({ tokens: [KAEL, POISONED], combat: inRound(2, LYRA_COMBATANT) });

      act(() =>
        board.getState().apply({
          kind: 'board',
          state: vharnBoard({
            version: 9,
            tokens: [KAEL, LYRA],
            combat: inRound(3, KAEL_COMBATANT),
          }),
        }),
      );

      expect(screen.queryByRole('status', { name: 'O que aconteceu' })).toBeNull();
    });

    it('a token this viewer does not see is not named', () => {
      const eye = kael({ id: 'kael-token', sight: { bright: 3, dim: 3 } });
      const far = { ...POISONED, name: 'Goblin', col: 15, row: 4, canControl: false };
      renderPanel(
        {
          viewer: { userId: BIA_AT_TABLE.userId, role: 'player' },
          scene: { ...VHARN_SCENE, vision: 'dark' },
          tokens: [eye, far],
          combat: inRound(2, LYRA_COMBATANT),
        },
        false,
      );

      turnChanged(5, 3, KAEL_COMBATANT);

      const told = screen.getByRole('status', { name: 'O que aconteceu' });
      expect(told).toHaveTextContent('Rodada 3 começou.');
      expect(told).not.toHaveTextContent('Goblin');
    });

    it('combat:ended tells "Combate encerrado depois de 3 rodadas." out of combat until "Fechar aviso"', async () => {
      renderPanel({ tokens: [KAEL, LYRA], combat: inRound(3, KAEL_COMBATANT) });

      act(() =>
        board.getState().apply({
          kind: 'boardEvent',
          event: eventAt(5, { type: 'combatEnded', payload: {} }),
        }),
      );

      expect(screen.getByText('Fora de combate')).toBeInTheDocument();
      expect(screen.getByRole('status', { name: 'O que aconteceu' })).toHaveTextContent(
        'Combate encerrado depois de 3 rodadas.',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }));
      expect(screen.queryByRole('status', { name: 'O que aconteceu' })).toBeNull();
    });
  });
});
