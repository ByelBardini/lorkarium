import type { BoardStateDto } from '@lorkarium/contracts';
import { cell, type Cell } from '@lorkarium/game-core';
import { test } from 'vitest';
import { DEFAULT_DRAWING_STYLE } from '@/lib/drawing-style';
import { sightNowOf, type SightInteraction } from '@/features/board/use-board-sight';
import { buildBoardView, type BoardViewInput, type RulerState } from '@/renderer/board-view';
import { stressBoardOf, stressId } from '../support/stress-board';

// The four situations of the budget in docs/context/client/performance.md, each one computing
// what the canvas does on a change: the sight filter (remembered by `sightNowOf`) and the view.
const BOARD = stressBoardOf();
const IDLE: SightInteraction = {
  sightPreview: false,
  selectedTokenIds: [],
  drag: null,
  preview: [],
  facingPreview: {},
};
// Token 1 is nobody's eye and carries no light; token 0 is the viewer's first eye.
const REMOTE_TOKEN_ID = stressId(1, 1);
const EYE_ID = stressId(1, 0);

type Dragged = Readonly<Record<string, Cell>>;

function viewOf(board: BoardStateDto, dragged: Dragged, ruler: RulerState | null): unknown {
  const sight = sightNowOf({ board, dragged }, IDLE);
  return buildBoardView(inputOf(board, dragged, ruler, sight));
}

function inputOf(
  board: BoardStateDto,
  dragged: Dragged,
  ruler: RulerState | null,
  sight: BoardViewInput['sight'],
): BoardViewInput {
  const viewer = { userId: board.viewer.userId, isMaster: false };
  const { scene, tokens, drawings, effectAreas, walls, lights } = board;
  return {
    ...{ scene, tokens, drawings, effectAreas, walls, lights, viewer, sight, dragged, ruler },
    ...{ localGridVisible: true, selectedTokenIds: [], activeLayer: 'tokens', tool: 'select' },
    ...{ canChooseLayer: false, preview: [], facingPreview: {}, resizePreview: {}, drag: null },
    ...{ readOnly: false, currentTokenIds: [], selectedDrawingIds: [], drawingPreview: [] },
    drawingStyle: DEFAULT_DRAWING_STYLE,
  };
}

// A fresh board each time: every array is new, so nothing is reused by identity.
function freshBoard(): BoardStateDto {
  return structuredClone(BOARD);
}

let step = 0;
function nextStep(): number {
  step = (step + 1) % 2;
  return step;
}

// Each cold build takes hundreds of ms before the caches: a few samples are enough, with room.
test('buildBoardView on the stress scene', { timeout: 300_000 }, async ({ bench }) => {
  await bench.compare(
    bench('cold build (new board)', () => viewOf(freshBoard(), {}, null)),
    bench('only the ruler changes', () => {
      const ruler = { from: cell(2, 2), to: cell(4 + nextStep(), 6) };
      viewOf(BOARD, {}, ruler);
    }),
    bench('a remote drag of a token that is no eye', () => {
      viewOf(BOARD, { [REMOTE_TOKEN_ID]: cell(5 + nextStep(), 6) }, null);
    }),
    bench("the viewer's eye walks one cell", () => {
      viewOf(BOARD, { [EYE_ID]: cell(2 + nextStep(), 2) }, null);
    }),
    { time: 500, iterations: 20 },
  );
});
