import { cell } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAWING_STYLE } from '@/lib/drawing-style';
import { buildBoardView, type BoardViewInput } from '@/renderer/board-view';
import { PATROL_STARTED_AT, squarePatrol } from '../support/patrol-fixtures';
import { KAEL_ID, VHARN_SCENE, kael, lyra } from '../support/table-session-fixtures';

const KAEL_ON_PATROL = kael({ patrol: squarePatrol({ startedAt: PATROL_STARTED_AT }) });

function viewAs(isMaster: boolean, more: Partial<BoardViewInput> = {}) {
  return buildBoardView({
    scene: VHARN_SCENE,
    localGridVisible: true,
    ruler: null,
    tokens: [KAEL_ON_PATROL, lyra()],
    selectedTokenIds: [KAEL_ID],
    activeLayer: 'tokens',
    canChooseLayer: isMaster,
    preview: [],
    facingPreview: {},
    resizePreview: {},
    drag: null,
    dragged: {},
    readOnly: false,
    tool: 'select',
    currentTokenIds: [],
    drawings: [],
    viewer: { userId: 'ana', isMaster },
    selectedDrawingIds: [],
    drawingPreview: [],
    drawingStyle: DEFAULT_DRAWING_STYLE,
    ...more,
  });
}

describe('buildBoardView, the patrol line', () => {
  it('the master with Kael selected alone gets his route', () => {
    expect(viewAs(true).patrolPath?.legs).toHaveLength(4);
  });

  it('the editor draft of the master is the line drawn', () => {
    const patrolDraft = { tokenId: KAEL_ID, path: [cell(5, 4)], repeat: 'loop' as const };

    expect(viewAs(true, { patrolDraft }).patrolPath).toMatchObject({ draft: true, legs: [] });
  });

  it('a player with Kael selected gets none', () => {
    expect(viewAs(false).patrolPath).toBeNull();
  });
});
