import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { TableSightOutlinesContext } from '@/features/board/table-sight-outlines';
import { sightNowOf, useBoardSight, type SightInteraction } from '@/features/board/use-board-sight';
import { levelOf } from '@/lib/board-sight';
import { NO_SIGHT_OUTLINES, type SightOutlines } from '@/lib/sight-geometry';
import { createBoardInteractionStore } from '@/stores/board-interaction-store';
import { createBoardStore } from '@/stores/board-store';
import { VHARN } from '../../support/campaigns-api-fake';
import {
  GOBLIN_ID,
  OGRE_ID,
  RIGHT_STRIP_OUTLINE,
  STATUE_ID,
  TOP_STRIP_OUTLINE,
  TRACED_ASSET_ID,
  blockerBoard,
  goblin,
  lookout,
  ogre,
  statue,
  tracedOutlines,
} from '../../support/sight-blocker-fixtures';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { VHARN_GRID } from '../../support/table-session-fixtures';

const NO_PLAYERS: readonly string[] = [];
const IDLE: SightInteraction = {
  sightPreview: false,
  selectedTokenIds: [],
  drag: null,
  preview: [],
  facingPreview: {},
};
const TRACED_STATUE = statue({ imageAssetId: TRACED_ASSET_ID });

function nowOf(
  table: Parameters<typeof sightNowOf>[0],
  outlines: SightOutlines = NO_SIGHT_OUTLINES,
) {
  return sightNowOf(table, IDLE, NO_PLAYERS, outlines);
}

describe('sightNowOf while a blocker moves', () => {
  const BOARD = blockerBoard([lookout(), statue(), ogre()]);

  it('the master dragging the statue aside brings the ogre back before it is dropped', () => {
    expect(levelOf(nowOf({ board: BOARD, dragged: {} }), OGRE_ID)).toBe('hidden');

    const sight = nowOf({ board: BOARD, dragged: { [STATUE_ID]: { col: 4, row: 9 } } });

    expect(levelOf(sight, OGRE_ID)).toBe('seen');
  });

  it('turning a traced statue works the filter out again before the ack', () => {
    const board = blockerBoard([lookout(), TRACED_STATUE, ogre()]);
    const outlines = tracedOutlines(RIGHT_STRIP_OUTLINE);
    expect(levelOf(nowOf({ board, dragged: {} }, outlines), OGRE_ID)).toBe('hidden');

    const turned = sightNowOf(
      { board, dragged: {} },
      { ...IDLE, facingPreview: { [STATUE_ID]: 90 } },
      NO_PLAYERS,
      outlines,
    );

    expect(levelOf(turned, OGRE_ID)).toBe('seen');
  });

  it('a goblin dragged keeps the eyes and only works its own level out', () => {
    const board = blockerBoard([lookout(), statue(), goblin(), ogre()]);
    const before = nowOf({ board, dragged: {} });

    const after = nowOf({ board, dragged: { [GOBLIN_ID]: { col: 7, row: 5 } } });

    expect(after.eyes).toBe(before.eyes);
    expect(levelOf(after, GOBLIN_ID)).toBe('hidden');
  });
});

describe('sightNowOf when an outline arrives', () => {
  const BOARD = blockerBoard([lookout(), TRACED_STATUE, ogre()]);

  it('the filter is done again: the chave with the geometry (armadilha of performance.md)', () => {
    const before = nowOf({ board: BOARD, dragged: {} });
    expect(levelOf(before, OGRE_ID)).toBe('hidden');

    const after = nowOf({ board: BOARD, dragged: {} }, tracedOutlines(TOP_STRIP_OUTLINE));

    expect(levelOf(after, OGRE_ID)).toBe('seen');
  });

  it('a new map with the same geometry keeps the same filter', () => {
    const first = nowOf({ board: BOARD, dragged: {} }, tracedOutlines(TOP_STRIP_OUTLINE));

    const again = nowOf({ board: BOARD, dragged: {} }, tracedOutlines(TOP_STRIP_OUTLINE));

    expect(again).toBe(first);
  });

  it('an outline null over the same rectangle keeps the same filter', () => {
    const first = nowOf({ board: BOARD, dragged: {} });

    const again = nowOf({ board: BOARD, dragged: {} }, new Map([[TRACED_ASSET_ID, null]]));

    expect(again).toBe(first);
  });
});

describe('sightNowOf with no blocker', () => {
  it('any outlines leave the very same filter', () => {
    const board = blockerBoard([lookout(), ogre()]);
    const first = nowOf({ board, dragged: {} });

    expect(nowOf({ board, dragged: {} }, tracedOutlines())).toBe(first);
  });
});

describe('useBoardSight in the room', () => {
  function sightWith(outlines: SightOutlines) {
    const board = createBoardStore(VHARN.id, () => undefined);
    board.setState({ board: blockerBoard([lookout(), TRACED_STATUE, ogre()]) });
    const interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands: new TableBoardCommandsFake(),
      describeRefusal: String,
    });
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <TableSightOutlinesContext value={outlines}>{children}</TableSightOutlinesContext>
    );
    return renderHook(() => useBoardSight(board, interaction), { wrapper }).result.current;
  }

  it('reads the outlines of the room: the traced statue lets the ogre show', () => {
    expect(levelOf(sightWith(tracedOutlines(TOP_STRIP_OUTLINE)), OGRE_ID)).toBe('seen');
  });

  it('outside a room the statue blocks by its rectangle', () => {
    expect(levelOf(sightWith(NO_SIGHT_OUTLINES), OGRE_ID)).toBe('hidden');
  });
});
