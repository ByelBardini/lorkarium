import type { TokenDto } from '@lorkarium/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { CombatHeader } from '@/features/combat/combat-header';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  KAEL_COMBATANT,
  LYRA_COMBATANT,
  lyra,
  vharnBoard,
  vharnCombat,
} from '../../support/table-session-fixtures';

const KAEL = lyra({ id: 'kael-token', name: 'Kael', canControl: true });
const LYRA = lyra({ canControl: false });

describe('CombatHeader', () => {
  let board: StoreApi<BoardStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;
  let asked: string[];

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    commands = new TableBoardCommandsFake();
    asked = [];
    interaction = createBoardInteractionStore({
      campaignId: VHARN.id,
      commands,
      describeRefusal: (failure) => (failure === 'turn_changed' ? 'A vez já passou.' : failure),
    });
  });

  function renderHeader(
    state: Partial<Parameters<typeof vharnBoard>[0]> = {},
    isMaster = true,
  ): void {
    board.getState().apply({ kind: 'board', state: vharnBoard(state) });
    render(
      <CombatHeader
        board={board}
        interaction={interaction}
        isMaster={isMaster}
        onPrepare={() => asked.push('prepare')}
        onAdd={() => asked.push('add')}
        onTokenless={() => asked.push('tokenless')}
      />,
    );
  }

  function inCombat(tokens: TokenDto[] = [KAEL, LYRA], round = 2, current = KAEL_COMBATANT) {
    return { tokens, combat: vharnCombat({ round, currentCombatantId: current }) };
  }

  async function chooseFrom(item: string): Promise<void> {
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções do combate' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: item }));
  }

  describe('out of combat', () => {
    it('reads "Fora de combate" with how many tokens the scene has', () => {
      renderHeader({ tokens: [KAEL, LYRA] });

      expect(screen.getByText('Fora de combate')).toBeInTheDocument();
      expect(screen.getByText('2 tokens na cena')).toBeInTheDocument();
    });

    it('"Iniciar combate" asks the panel for the preparation and sends nothing', async () => {
      renderHeader({ tokens: [KAEL, LYRA] });

      await userEvent.click(screen.getByRole('button', { name: 'Iniciar combate' }));

      expect(asked).toEqual(['prepare']);
      expect(commands.sent).toEqual([]);
    });

    it('with only objects in the scene "Iniciar combate" is off and says why', () => {
      renderHeader({ tokens: [lyra({ id: 'bau', name: 'Baú', layer: 'objects' })] });

      expect(screen.getByText('0 tokens na cena')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Iniciar combate' })).toBeDisabled();
      expect(screen.getByText('Ponha tokens na cena primeiro.')).toBeInTheDocument();
    });

    it('a player sees no "Iniciar combate"', () => {
      renderHeader({ tokens: [KAEL] }, false);

      expect(screen.queryByRole('button', { name: 'Iniciar combate' })).toBeNull();
    });
  });

  describe('in combat', () => {
    it('reads the round and whose turn it is', () => {
      renderHeader(inCombat());

      const tracker = screen.getByRole('region', { name: 'Combate em andamento' });
      expect(tracker).toHaveTextContent('Rodada 2');
      expect(tracker).toHaveTextContent('Vez de Kael');
    });

    it('a turn whose tokens this viewer does not see reads "Vez de alguém fora de vista"', () => {
      renderHeader(inCombat([LYRA]), false);

      expect(screen.getByRole('region', { name: 'Combate em andamento' })).toHaveTextContent(
        'Vez de alguém fora de vista',
      );
    });

    it('the master moves the turn from the one on turn, both ways', async () => {
      renderHeader(inCombat());

      await userEvent.click(screen.getByRole('button', { name: 'Próximo turno' }));
      await userEvent.click(screen.getByRole('button', { name: 'Turno anterior' }));

      expect(commands.sent.map(({ name, fields }) => [name, fields])).toEqual([
        ['nextTurn', { fromCombatantId: KAEL_COMBATANT }],
        ['previousTurn', { fromCombatantId: KAEL_COMBATANT }],
      ]);
    });

    it('on the last of the order the button reads "Fechar rodada 2" and next comes Kael in round 3', () => {
      renderHeader(inCombat([KAEL, LYRA], 2, LYRA_COMBATANT));

      expect(screen.getByRole('button', { name: 'Fechar rodada 2' })).toBeInTheDocument();
      expect(screen.getByText('A seguir: Kael · rodada 3')).toBeInTheDocument();
    });

    it('on Kael, next comes the Lyra', () => {
      renderHeader(inCombat());

      expect(screen.getByText('A seguir: Lyra')).toBeInTheDocument();
    });

    it('a player who runs the entry on turn only sees "Passar a vez"', async () => {
      renderHeader(inCombat(), false);

      await userEvent.click(screen.getByRole('button', { name: 'Passar a vez' }));

      expect(screen.queryByRole('button', { name: 'Turno anterior' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Mais opções do combate' })).toBeNull();
      expect(commands.sentAs('nextTurn')).toHaveLength(1);
    });

    it('a player who does not run the entry on turn sees no turn button', () => {
      renderHeader(inCombat([{ ...KAEL, canControl: false }, LYRA]), false);

      expect(screen.queryByRole('button', { name: 'Passar a vez' })).toBeNull();
    });

    it('read only (reconnecting) disables the turn and the menu', () => {
      renderHeader(inCombat());

      act(() => interaction.getState().setReadOnly(true));

      expect(screen.getByRole('button', { name: 'Próximo turno' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Mais opções do combate' })).toBeDisabled();
    });

    it('a refused "Próximo turno" says "A vez já passou."', async () => {
      commands.answerWith({ ok: false, failure: 'turn_changed' });
      renderHeader(inCombat());

      await userEvent.click(screen.getByRole('button', { name: 'Próximo turno' }));

      expect(interaction.getState().notice).toBe('A vez já passou.');
    });
  });

  describe('the "⋯" of the master', () => {
    it('"Adicionar ao combate" and "Entrada sem token" ask the panel', async () => {
      renderHeader(inCombat([KAEL, LYRA, lyra({ id: 'lobo', name: 'Lobo' })]));

      await chooseFrom('Adicionar ao combate');
      await chooseFrom('Entrada sem token');

      expect(asked).toEqual(['add', 'tokenless']);
    });

    it('with everyone in the order "Adicionar ao combate" is off and says why', async () => {
      renderHeader(inCombat());

      await userEvent.click(screen.getByRole('button', { name: 'Mais opções do combate' }));

      const add = await screen.findByRole('menuitem', { name: /Adicionar ao combate/ });
      expect(add).toHaveAttribute('aria-disabled', 'true');
      expect(add).toHaveTextContent('Todo mundo da cena já está na ordem.');
    });

    it('"Encerrar combate" asks in place, and "Encerrar" sends combat:end', async () => {
      renderHeader(inCombat());

      await chooseFrom('Encerrar combate');

      const confirm = screen.getByRole('alertdialog', { name: 'Encerrar o combate?' });
      expect(confirm).toHaveAccessibleDescription(
        'PV, barras e condições ficam como estão. A ordem de iniciativa e a contagem de rodadas somem.',
      );
      expect(commands.sent).toEqual([]);
      await userEvent.click(within(confirm).getByRole('button', { name: 'Encerrar' }));
      expect(commands.sentAs('endCombat')).toHaveLength(1);
    });

    it('"Continuar lutando" closes the question and sends nothing', async () => {
      renderHeader(inCombat());
      await chooseFrom('Encerrar combate');

      await userEvent.click(screen.getByRole('button', { name: 'Continuar lutando' }));

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(commands.sent).toEqual([]);
    });
  });
});
