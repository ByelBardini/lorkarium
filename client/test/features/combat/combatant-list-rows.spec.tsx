import { act, render } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { CombatantList } from '@/features/combat/combatant-list';
import type { TokenLineProps } from '@/features/tokens/token-line';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createTablePresenceStore } from '@/stores/table-presence-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { stressId } from '../../support/stress-board';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  ANA_AT_TABLE,
  lyra,
  soloCombatant,
  tokenUpdatedAt,
  vharnBoard,
  vharnCombat,
  VHARN_GRID,
} from '../../support/table-session-fixtures';

// Each solo entry of the order draws one TokenLine: counting them counts the rows that rendered.
const lines = vi.hoisted(() => ({ rendered: [] as string[] }));
vi.mock('@/features/tokens/token-line', async (original) => {
  const actual = await original<typeof import('@/features/tokens/token-line')>();
  function CountedTokenLine(props: TokenLineProps): React.JSX.Element {
    lines.rendered.push(props.token.id);
    return createElement(actual.TokenLine, props);
  }
  return { ...actual, TokenLine: CountedTokenLine };
});

// 30 entries of one token each, every one of a distinct name and initiative.
const TOKENS = Array.from({ length: 30 }, (_, n) =>
  lyra({ id: stressId(1, n), name: `Token ${n}`, controllerIds: [] }),
);
const COMBAT = vharnCombat({
  currentCombatantId: stressId(2, 0),
  combatants: TOKENS.map((token, n) => soloCombatant(stressId(2, n), token.id, 30 - n, 0)),
});

describe('CombatantList of 30 entries', () => {
  let board: StoreApi<BoardStore>;
  let interaction: StoreApi<BoardInteractionStore>;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    const presence = createTablePresenceStore(VHARN.id);
    presence.setState({ members: [ANA_AT_TABLE] });
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands: new TableBoardCommandsFake(),
      describeRefusal: String,
    });
    board
      .getState()
      .apply({ kind: 'board', state: vharnBoard({ tokens: TOKENS, combat: COMBAT }) });
    render(<CombatantList board={board} presence={presence} interaction={interaction} isMaster />);
    lines.rendered = [];
  });

  it('one token hurt renders only its row', () => {
    const hurt = { ...TOKENS[7]!, bars: TOKENS[7]!.bars.map((bar) => ({ ...bar, current: 1 })) };

    act(() => board.getState().apply({ kind: 'boardEvent', event: tokenUpdatedAt(5, hurt) }));

    expect(lines.rendered).toEqual([TOKENS[7]!.id]);
  });

  it('one token selected renders only its row', () => {
    act(() => interaction.getState().select(TOKENS[9]!.id));

    expect(lines.rendered).toEqual([TOKENS[9]!.id]);
  });
});
