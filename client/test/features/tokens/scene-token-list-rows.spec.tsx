import { act, render } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { SceneTokenList } from '@/features/tokens/scene-token-list';
import type { TokenLineProps } from '@/features/tokens/token-line';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createTablePresenceStore } from '@/stores/table-presence-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { stressId } from '../../support/stress-board';
import {
  lyra,
  tokenUpdatedAt,
  vharnBoard,
  vharnState,
  VHARN_GRID,
} from '../../support/table-session-fixtures';

// Each line of "Na cena" draws one TokenLine: counting them counts the rows that rendered.
const lines = vi.hoisted(() => ({ rendered: [] as string[] }));
vi.mock('@/features/tokens/token-line', async (original) => {
  const actual = await original<typeof import('@/features/tokens/token-line')>();
  function CountedTokenLine(props: TokenLineProps): React.JSX.Element {
    lines.rendered.push(props.token.id);
    return createElement(actual.TokenLine, props);
  }
  return { ...actual, TokenLine: CountedTokenLine };
});

// 300 tokens of distinct names, so none folds in a group.
const TOKENS = Array.from({ length: 300 }, (_, n) =>
  lyra({ id: stressId(1, n), name: `Token ${n}`, controllerIds: [] }),
);

describe('SceneTokenList of 300 tokens', () => {
  let board: StoreApi<BoardStore>;
  let interaction: StoreApi<BoardInteractionStore>;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    const presence = createTablePresenceStore(VHARN.id);
    presence.getState().apply({ kind: 'state', state: vharnState() });
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands: new TableBoardCommandsFake(),
      describeRefusal: String,
    });
    board.getState().apply({ kind: 'board', state: vharnBoard({ tokens: TOKENS }) });
    render(<SceneTokenList board={board} presence={presence} interaction={interaction} isMaster />);
    lines.rendered = [];
  });

  it('one token renamed renders only its line', () => {
    const renamed = { ...TOKENS[7]!, name: 'Token 7, o Velho' };

    act(() => board.getState().apply({ kind: 'boardEvent', event: tokenUpdatedAt(5, renamed) }));

    expect(lines.rendered).toEqual([TOKENS[7]!.id]);
  });

  it('one token selected renders only its line', () => {
    act(() => interaction.getState().select(TOKENS[9]!.id));

    expect(lines.rendered).toEqual([TOKENS[9]!.id]);
  });
});
