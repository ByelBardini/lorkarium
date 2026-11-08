import { cell } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { boardPatrolPathOf, patrolPathViewOf } from '@/renderer/patrol-path-view';
import { PATROL_STARTED_AT, squarePatrol } from '../support/patrol-fixtures';
import { KAEL_ID, LYRA_ID, kael, lyra } from '../support/table-session-fixtures';

const ONE_CELL = { width: 1, height: 1 };
const SQUARE = [cell(0, 0), cell(2, 0), cell(2, 2), cell(0, 2)];

describe('patrolPathViewOf', () => {
  it('a loop of 4 points of a 1 × 1 token has 4 legs through the cell centers, the last closing back', () => {
    const view = patrolPathViewOf({ path: SQUARE, repeat: 'loop', size: ONE_CELL, draft: false });

    expect(view.legs).toEqual([
      { from: { x: 32, y: 32 }, to: { x: 160, y: 32 }, closing: false },
      { from: { x: 160, y: 32 }, to: { x: 160, y: 160 }, closing: false },
      { from: { x: 160, y: 160 }, to: { x: 32, y: 160 }, closing: false },
      { from: { x: 32, y: 160 }, to: { x: 32, y: 32 }, closing: true },
    ]);
  });

  it('a bounce of 3 points has 2 legs and does not close', () => {
    const path = [cell(0, 0), cell(3, 0), cell(3, 2)];

    const view = patrolPathViewOf({ path, repeat: 'bounce', size: ONE_CELL, draft: false });

    expect(view.legs.map(({ closing }) => closing)).toEqual([false, false]);
  });

  it('a 2 × 2 token draws through the center of its footprint, and marks where it walks', () => {
    const view = patrolPathViewOf({
      path: [cell(0, 0), cell(4, 0)],
      repeat: 'loop',
      size: { width: 2, height: 2 },
      here: cell(2, 0),
      draft: false,
    });

    expect(view.points).toEqual([
      { x: 64, y: 64 },
      { x: 320, y: 64 },
    ]);
    expect(view.here).toEqual({ x: 192, y: 64 });
  });

  it('a loop of only 2 points walks the same leg back: no closing leg over it', () => {
    const view = patrolPathViewOf({
      path: [cell(0, 0), cell(3, 0)],
      repeat: 'loop',
      size: ONE_CELL,
      draft: false,
    });

    expect(view.legs).toHaveLength(1);
  });
});

describe('boardPatrolPathOf', () => {
  const kaelOnPatrol = kael({ patrol: squarePatrol({ startedAt: PATROL_STARTED_AT }) });
  const tokens = [kaelOnPatrol, lyra()];
  const master = { isMaster: true };
  const patrols = new Map([[KAEL_ID, { col: 2, row: 0, facing: 0, glideMs: 1000 }]]);

  it('the master with Kael selected alone gets his saved route, marked where he walks', () => {
    const view = boardPatrolPathOf({
      viewer: master,
      tokens,
      selectedTokenIds: [KAEL_ID],
      patrols,
    });

    expect(view).toMatchObject({ draft: false, here: { x: 160, y: 32 } });
    expect(view?.legs).toHaveLength(4);
  });

  it('the draft of the editor wins over the saved route', () => {
    const patrolDraft = {
      tokenId: KAEL_ID,
      path: [cell(5, 4), cell(8, 4)],
      repeat: 'bounce' as const,
    };

    const view = boardPatrolPathOf({
      viewer: master,
      tokens,
      selectedTokenIds: [KAEL_ID],
      patrolDraft,
    });

    expect(view).toMatchObject({
      draft: true,
      points: [
        { x: 352, y: 288 },
        { x: 544, y: 288 },
      ],
    });
  });

  it('two tokens selected draw no route', () => {
    expect(
      boardPatrolPathOf({ viewer: master, tokens, selectedTokenIds: [KAEL_ID, LYRA_ID] }),
    ).toBeNull();
  });

  it('a token with no patrol draws no route', () => {
    expect(boardPatrolPathOf({ viewer: master, tokens, selectedTokenIds: [LYRA_ID] })).toBeNull();
  });

  it('a player with Kael selected never gets the route', () => {
    const player = { isMaster: false };

    expect(boardPatrolPathOf({ viewer: player, tokens, selectedTokenIds: [KAEL_ID] })).toBeNull();
  });
});
