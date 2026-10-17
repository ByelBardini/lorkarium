import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { TokenContextMenu, type TokenMenuRequest } from '@/features/board/token-context-menu';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { KAEL_ID, LYRA_ID, kael, lyra, vharnBoard } from '../../support/table-session-fixtures';

const GOBLIN_ID = '7f6e5d4c-3b2a-4f1e-8d9c-0b1a2c3d4e5f';

describe('TokenContextMenu', () => {
  let board: StoreApi<BoardStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;
  let closed: number;
  let conditionTargets: Array<readonly string[]>;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    const goblin = lyra({ id: GOBLIN_ID, name: 'Goblin', layer: 'objects' });
    board
      .getState()
      .apply({ kind: 'board', state: vharnBoard({ tokens: [lyra(), kael(), goblin] }) });
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      campaignId: VHARN.id,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
    });
    closed = 0;
    conditionTargets = [];
  });

  function openOn(tokenId: string): void {
    const request: TokenMenuRequest = { tokenId, x: 120, y: 80 };
    render(
      <TokenContextMenu
        request={request}
        board={board}
        interaction={interaction}
        onApplyCondition={(tokenIds) => conditionTargets.push(tokenIds)}
        onClose={() => (closed += 1)}
      />,
    );
  }

  it('opens "Ações de Goblin" with the layer of the token checked under "Mover para camada"', () => {
    openOn(GOBLIN_ID);
    expect(screen.getByRole('menu', { name: 'Ações de Goblin' })).not.toBeNull();
    expect(screen.getByRole('group', { name: 'Mover para camada' })).not.toBeNull();
    expect(screen.getByRole('menuitemradio', { name: 'Objetos' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('on a token of a selection of three, "Objetos" moves the three', async () => {
    interaction.getState().selectMany([LYRA_ID, KAEL_ID, GOBLIN_ID], { additive: false });
    openOn(KAEL_ID);
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Objetos' }));
    expect(commands.sentAs('setTokenLayer').map(({ fields }) => fields)).toEqual([
      { tokenIds: [LYRA_ID, KAEL_ID, GOBLIN_ID], layer: 'objects' },
    ]);
    expect(closed).toBe(1);
  });

  it('on a token outside the selection, only that token moves', async () => {
    interaction.getState().selectMany([LYRA_ID, GOBLIN_ID], { additive: false });
    openOn(KAEL_ID);
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Fundo' }));
    expect(commands.sentAs('setTokenLayer').map(({ fields }) => fields)).toEqual([
      { tokenIds: [KAEL_ID], layer: 'background' },
    ]);
  });

  it('Esc closes it without sending anything', async () => {
    openOn(LYRA_ID);
    await userEvent.keyboard('{Escape}');
    expect(closed).toBe(1);
    expect(commands.sent).toEqual([]);
  });

  it('a refused change says why on the status line', async () => {
    commands.answerWith({ ok: false, failure: 'forbidden' });
    openOn(LYRA_ID);
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Fundo' }));
    await act(() => Promise.resolve());
    expect(interaction.getState().notice).toBe('recusado: forbidden');
  });

  it('"Aplicar condição…" on a token of the selection asks for the whole selection', async () => {
    interaction.getState().selectMany([LYRA_ID, KAEL_ID], { additive: false });
    openOn(KAEL_ID);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Aplicar condição…' }));
    expect(conditionTargets).toEqual([[LYRA_ID, KAEL_ID]]);
    expect(closed).toBe(1);
  });

  it('"Aplicar condição…" on a token outside the selection asks for that token alone', async () => {
    interaction.getState().selectMany([LYRA_ID, GOBLIN_ID], { additive: false });
    openOn(KAEL_ID);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Aplicar condição…' }));
    expect(conditionTargets).toEqual([[KAEL_ID]]);
  });
});
