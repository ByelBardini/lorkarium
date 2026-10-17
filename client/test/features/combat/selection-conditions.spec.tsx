import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TokenDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { ApplyConditionDialog } from '@/features/combat/apply-condition-dialog';
import { SelectionConditions } from '@/features/combat/selection-conditions';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  KAEL_ID,
  LYRA_ID,
  activeCondition,
  kael,
  lyra,
  vharnBoard,
} from '../../support/table-session-fixtures';

const GOBLIN_ID = '7f6e5d4c-3b2a-4f1e-8d9c-0b1a2c3d4e5f';
const CAIDO = {
  id: activeCondition().conditionId,
  name: 'Caído',
  tone: 'harm',
  icon: 'skull',
} as const;

describe('condition on several tokens', () => {
  let board: StoreApi<BoardStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      campaignId: VHARN.id,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
    });
  });

  function seat(tokens: TokenDto[]): void {
    board.getState().apply({
      kind: 'board',
      state: vharnBoard({ tokens, conditionDefinitions: [CAIDO] }),
    });
  }

  function select(ids: string[]): void {
    act(() => interaction.getState().selectMany(ids, { additive: false }));
  }

  describe('SelectionConditions', () => {
    function renderSection(isMaster = true): void {
      render(<SelectionConditions board={board} interaction={interaction} isMaster={isMaster} />);
    }

    it('with one token selected it is not there', () => {
      seat([lyra(), kael()]);
      renderSection();
      select([LYRA_ID]);
      expect(screen.queryByRole('region', { name: 'Condição nos selecionados' })).toBeNull();
    });

    it('with two selected, "Caído" goes to both in one condition:applyMany', async () => {
      seat([lyra(), kael()]);
      renderSection();
      select([LYRA_ID, KAEL_ID]);
      await userEvent.type(screen.getByRole('combobox', { name: 'Condição em 2 tokens' }), 'caido');
      await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
      expect(commands.sentAs('applyConditions').map(({ fields }) => fields)).toEqual([
        { tokenIds: [LYRA_ID, KAEL_ID], conditionId: CAIDO.id, rounds: 0 },
      ]);
    });

    it('a selected token the viewer does not control is left out, and it says so', async () => {
      seat([lyra(), kael(), lyra({ id: GOBLIN_ID, name: 'Goblin', canControl: false })]);
      renderSection(false);
      select([LYRA_ID, KAEL_ID, GOBLIN_ID]);
      expect(screen.getByText('1 selecionado não é seu e fica de fora.')).toBeInTheDocument();
      await userEvent.type(screen.getByRole('combobox', { name: 'Condição em 2 tokens' }), 'Caído');
      await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
      expect(commands.sentAs('applyConditions')[0]?.fields).toMatchObject({
        tokenIds: [LYRA_ID, KAEL_ID],
      });
    });

    it('when none of the selected is the viewer’s, it is not there', () => {
      seat([lyra({ canControl: false }), kael({ canControl: false })]);
      renderSection(false);
      select([LYRA_ID, KAEL_ID]);
      expect(screen.queryByRole('region', { name: 'Condição nos selecionados' })).toBeNull();
    });
  });

  describe('ApplyConditionDialog', () => {
    let closed: number;

    function renderDialog(tokenIds: readonly string[]): void {
      closed = 0;
      render(
        <ApplyConditionDialog
          tokenIds={tokenIds}
          board={board}
          interaction={interaction}
          isMaster
          onClose={() => (closed += 1)}
        />,
      );
    }

    it('on one token it names it, sends condition:applyMany and closes on ok', async () => {
      seat([lyra(), kael()]);
      renderDialog([KAEL_ID]);
      expect(screen.getByRole('dialog', { name: 'Aplicar condição' })).toHaveTextContent(
        'Em Kael.',
      );
      await userEvent.type(screen.getByRole('combobox', { name: 'Condição' }), 'Caído{Enter}');
      expect(commands.sentAs('applyConditions').map(({ fields }) => fields)).toEqual([
        { tokenIds: [KAEL_ID], conditionId: CAIDO.id, rounds: 0 },
      ]);
      expect(closed).toBe(1);
    });

    it('a refusal keeps it open and says why on the status line', async () => {
      seat([lyra(), kael()]);
      commands.answerWith({ ok: false, failure: 'forbidden' });
      renderDialog([LYRA_ID, KAEL_ID]);
      expect(screen.getByRole('dialog')).toHaveTextContent('Nos 2 selecionados.');
      await userEvent.type(screen.getByRole('combobox', { name: 'Condição' }), 'Caído{Enter}');
      expect(closed).toBe(0);
      expect(interaction.getState().notice).toBe('recusado: forbidden');
    });
  });
});
