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
import type { TokenDto } from '@lorkarium/contracts';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  KAEL_COMBATANT,
  lyra,
  vharnBoard,
  vharnCombat,
} from '../../support/table-session-fixtures';

const KAEL = lyra({ id: 'kael-token', name: 'Kael', canControl: true });

describe('CombatHeader', () => {
  let board: StoreApi<BoardStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      campaignId: VHARN.id,
      commands,
      describeRefusal: String,
    });
  });

  function renderHeader(
    state: Partial<Parameters<typeof vharnBoard>[0]> = {},
    isMaster = true,
  ): void {
    board.getState().apply({ kind: 'board', state: vharnBoard(state) });
    render(<CombatHeader board={board} interaction={interaction} isMaster={isMaster} />);
  }

  function inCombat(tokens: TokenDto[] = [KAEL, lyra()]) {
    return { tokens, combat: vharnCombat({ round: 3 }) };
  }

  it('out of combat the master sees "Iniciar combate"; the dialog checks every token and starts with the checked', async () => {
    renderHeader({ tokens: [KAEL, lyra()] });
    expect(screen.getByText('Fora de combate')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar combate' }));
    const dialog = screen.getByRole('dialog', { name: 'Iniciar combate' });
    expect(within(dialog).getByRole('checkbox', { name: 'Kael' })).toBeChecked();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Lyra' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Iniciar' }));
    expect(commands.sentAs('startCombat')).toEqual([
      {
        name: 'startCombat',
        campaignId: VHARN.id,
        fields: { entries: [{ name: null, tokenIds: ['kael-token'] }] },
      },
    ]);
  });

  it('with no token in the scene "Iniciar combate" is disabled and says why', () => {
    renderHeader({ tokens: [] });
    expect(screen.getByRole('button', { name: 'Iniciar combate' })).toBeDisabled();
    expect(screen.getByText('Ponha tokens na cena primeiro.')).toBeInTheDocument();
  });

  it('the chest of the Objetos layer is not offered to start the combat', async () => {
    renderHeader({ tokens: [KAEL, lyra({ id: 'bau', name: 'Baú', layer: 'objects' })] });

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar combate' }));

    const dialog = screen.getByRole('dialog', { name: 'Iniciar combate' });
    expect(within(dialog).queryByRole('checkbox', { name: 'Baú' })).toBeNull();
    expect(within(dialog).getByRole('checkbox', { name: 'Kael' })).toBeChecked();
  });

  it('with only objects in the scene "Iniciar combate" is disabled and says why', () => {
    renderHeader({ tokens: [lyra({ id: 'bau', name: 'Baú', layer: 'objects' })] });

    expect(screen.getByRole('button', { name: 'Iniciar combate' })).toBeDisabled();
    expect(screen.getByText('Ponha tokens na cena primeiro.')).toBeInTheDocument();
  });

  it('a player out of combat sees no "Iniciar combate"', () => {
    renderHeader({ tokens: [KAEL] }, false);
    expect(screen.queryByRole('button', { name: 'Iniciar combate' })).toBeNull();
  });

  it('in combat it reads the round, how many are in and whose turn it is', () => {
    renderHeader(inCombat());
    const tracker = screen.getByRole('region', { name: 'Combate em andamento' });
    expect(tracker).toHaveTextContent('Rodada3');
    expect(tracker).toHaveTextContent('2 no combate');
    expect(tracker).toHaveTextContent('Vez de Kael');
  });

  it('the master moves the turn from the one on turn', async () => {
    renderHeader(inCombat());
    await userEvent.click(screen.getByRole('button', { name: 'Próximo turno' }));
    await userEvent.click(screen.getByRole('button', { name: 'Turno anterior' }));
    expect(commands.sent.map(({ name, fields }) => [name, fields])).toEqual([
      ['nextTurn', { fromCombatantId: KAEL_COMBATANT }],
      ['previousTurn', { fromCombatantId: KAEL_COMBATANT }],
    ]);
  });

  it('a player sees "Passar a vez" on the turn of a token they control, and not otherwise', () => {
    renderHeader(inCombat(), false);
    expect(screen.getByRole('button', { name: 'Passar a vez' })).toBeInTheDocument();
    act(() =>
      board.getState().apply({
        kind: 'board',
        state: vharnBoard({
          tokens: [{ ...KAEL, canControl: false }, lyra()],
          combat: vharnCombat(),
        }),
      }),
    );
    expect(screen.queryByRole('button', { name: 'Passar a vez' })).toBeNull();
  });

  it('"Encerrar combate" asks first', async () => {
    renderHeader(inCombat());
    await userEvent.click(screen.getByRole('button', { name: 'Encerrar combate' }));
    expect(
      screen.getByText('Encerrar o combate? A ordem e a rodada se perdem.'),
    ).toBeInTheDocument();
    expect(commands.sent).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Encerrar' }));
    expect(commands.sentAs('endCombat')).toHaveLength(1);
  });

  it('while reconnecting the turn buttons are disabled', () => {
    renderHeader(inCombat());
    act(() => interaction.getState().setReadOnly(true));
    expect(screen.getByRole('button', { name: 'Próximo turno' })).toBeDisabled();
  });

  it('a refused "Próximo turno" says "A vez já passou."', async () => {
    interaction = createBoardInteractionStore({
      campaignId: VHARN.id,
      commands,
      describeRefusal: (failure) => (failure === 'turn_changed' ? 'A vez já passou.' : failure),
    });
    commands.answerWith({ ok: false, failure: 'turn_changed' });
    renderHeader(inCombat());
    await userEvent.click(screen.getByRole('button', { name: 'Próximo turno' }));
    expect(interaction.getState().notice).toBe('A vez já passou.');
  });
});
