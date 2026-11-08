import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TokenDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { boardCommandFailureMessage } from '@/features/board/board-messages';
import { TokenContextMenu } from '@/features/board/token-context-menu';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { PATROL_STARTED_AT, squarePatrol } from '../../support/patrol-fixtures';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  BIA_AT_TABLE,
  KAEL_ID,
  LYRA_ID,
  kael,
  lyra,
  vharnBoard,
  VHARN_GRID,
} from '../../support/table-session-fixtures';

const PAUSED = squarePatrol();
const RUNNING = squarePatrol({ startedAt: PATROL_STARTED_AT });

describe('TokenContextMenu, "Patrulha…" and "Patrulhando" (master)', () => {
  let board: StoreApi<BoardStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;
  let edited: string[];
  let closed: number;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: boardCommandFailureMessage,
    });
    interaction.getState().allowLayerChoice(true);
    edited = [];
    closed = 0;
  });

  function openOn(tokenId: string, tokens: TokenDto[], viewer = vharnBoard().viewer): void {
    board.getState().apply({ kind: 'board', state: vharnBoard({ tokens, viewer }) });
    render(
      <TokenContextMenu
        request={{ tokenId, x: 120, y: 80 }}
        board={board}
        interaction={interaction}
        onApplyCondition={() => undefined}
        onChangeImage={() => undefined}
        onChangeAura={() => undefined}
        onEditPatrol={(id) => edited.push(id)}
        onClose={() => (closed += 1)}
      />,
    );
  }

  const patrolling = () => screen.queryByRole('menuitemcheckbox', { name: 'Patrulhando' });

  it('"Patrulha…" on Kael opens the editor of Kael and closes the menu', async () => {
    openOn(KAEL_ID, [kael(), lyra()]);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Patrulha…' }));

    expect(edited).toEqual([KAEL_ID]);
    expect(closed).toBe(1);
  });

  it('"Patrulhando" is checked while Kael’s patrol runs', () => {
    openOn(KAEL_ID, [kael({ patrol: RUNNING })]);

    expect(patrolling()).toHaveAttribute('aria-checked', 'true');
  });

  it('with Kael and Lyra selected, "Patrulhando" starts both in one command and says so', async () => {
    interaction.getState().selectMany([KAEL_ID, LYRA_ID], { additive: false });
    openOn(KAEL_ID, [kael({ patrol: PAUSED }), lyra({ patrol: PAUSED })]);

    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Patrulhando' }));

    expect(commands.sentAs('setTokenPatrolsActive').map(({ fields }) => fields)).toEqual([
      { tokenIds: [KAEL_ID, LYRA_ID], active: true },
    ]);
    expect(interaction.getState().notice).toBe('2 tokens patrulhando.');
  });

  it('a running patrol is paused: active false', async () => {
    openOn(KAEL_ID, [kael({ patrol: RUNNING })]);

    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Patrulhando' }));

    expect(commands.sentAs('setTokenPatrolsActive')[0]?.fields).toEqual({
      tokenIds: [KAEL_ID],
      active: false,
    });
    expect(interaction.getState().notice).toBe('Kael parado.');
  });

  it('the targets with no route are left out of the command', async () => {
    interaction.getState().selectMany([KAEL_ID, LYRA_ID], { additive: false });
    openOn(KAEL_ID, [kael({ patrol: PAUSED }), lyra()]);

    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Patrulhando' }));

    expect(commands.sentAs('setTokenPatrolsActive')[0]?.fields).toEqual({
      tokenIds: [KAEL_ID],
      active: true,
    });
  });

  it('a token with no route has "Patrulhando" off, described "Desenhe uma patrulha primeiro."', () => {
    openOn(KAEL_ID, [kael()]);

    expect(patrolling()).toHaveAttribute('aria-disabled', 'true');
    expect(patrolling()).toHaveAccessibleDescription('Desenhe uma patrulha primeiro.');
  });

  it('a start past 30 running patrols says "Este grid já tem 30 patrulhas ligadas."', async () => {
    commands.answerWith({ ok: false, failure: 'token_patrol_limit' });
    openOn(KAEL_ID, [kael({ patrol: PAUSED })]);

    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Patrulhando' }));

    expect(interaction.getState().notice).toBe('Este grid já tem 30 patrulhas ligadas.');
  });

  it('Bia, a player in the control of Lyra, has neither item', () => {
    interaction.getState().allowLayerChoice(false);
    const viewer = { userId: BIA_AT_TABLE.userId, role: 'player' as const };
    openOn(LYRA_ID, [lyra({ patrol: RUNNING })], viewer);

    expect(screen.queryByRole('menuitem', { name: 'Patrulha…' })).toBeNull();
    expect(patrolling()).toBeNull();
  });
});
