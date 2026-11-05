import type { BoardStateDto } from '@lorkarium/contracts';
import { cell, type Cell } from '@lorkarium/game-core';
import { test } from 'vitest';
import { DEFAULT_DRAWING_STYLE } from '@/lib/drawing-style';
import { NO_SIGHT_OUTLINES, type SightOutlines } from '@/lib/sight-geometry';
import { sightNowOf, type SightInteraction } from '@/features/board/use-board-sight';
import { buildBoardView, type BoardViewInput, type RulerState } from '@/renderer/board-view';
import {
  STRESS_BLOCKER_OUTLINES,
  stressBlockerBoardOf,
  stressBlockerIds,
  stressBoardOf,
  stressId,
  stressOverlappedBlockersBoardOf,
} from '../support/stress-board';

// The situations of the budget in docs/context/client/performance.md, each one computing
// what the canvas does on a change: the sight filter (remembered by `sightNowOf`) and the view.
const BOARD = stressBoardOf();
// The stress board is seen by a player: the table's players matter only to a spectator.
const NO_PLAYERS: readonly string[] = [];
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

// Token 5 carries an aura: a restyle of it is a board whose `tokens` alone is new (the reducer).
const AURA_TOKEN_INDEX = 5;
const RESTYLED = [1, 2].map((radius) => ({
  ...BOARD,
  tokens: BOARD.tokens.map((token, index) =>
    index === AURA_TOKEN_INDEX && token.aura
      ? { ...token, aura: { ...token.aura, radius } }
      : token,
  ),
}));

type Outlook = Readonly<{
  ruler?: RulerState | null;
  outlines?: SightOutlines;
  facingPreview?: SightInteraction['facingPreview'];
}>;

function viewOf(board: BoardStateDto, dragged: Dragged, outlook: Outlook = {}): unknown {
  const { outlines = NO_SIGHT_OUTLINES, facingPreview = IDLE.facingPreview } = outlook;
  const interaction = { ...IDLE, facingPreview };
  const sight = sightNowOf({ board, dragged }, interaction, NO_PLAYERS, outlines);
  return buildBoardView(inputOf(board, dragged, sight, outlook));
}

function inputOf(
  board: BoardStateDto,
  dragged: Dragged,
  sight: BoardViewInput['sight'],
  { ruler = null, outlines = NO_SIGHT_OUTLINES, facingPreview = IDLE.facingPreview }: Outlook,
): BoardViewInput {
  const viewer = { userId: board.viewer.userId, isMaster: false };
  const { scene, tokens, drawings, effectAreas, walls, lights } = board;
  return {
    ...{ scene, tokens, drawings, effectAreas, walls, lights, viewer, sight, dragged, ruler },
    ...{ localGridVisible: true, selectedTokenIds: [], activeLayer: 'tokens', tool: 'select' },
    ...{ canChooseLayer: false, preview: [], facingPreview, resizePreview: {}, drag: null },
    ...{ readOnly: false, currentTokenIds: [], selectedDrawingIds: [], drawingPreview: [] },
    drawingStyle: DEFAULT_DRAWING_STYLE,
    sightOutlines: outlines,
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
    bench('cold build (new board)', () => viewOf(freshBoard(), {})),
    bench('only the ruler changes', () => {
      const ruler = { from: cell(2, 2), to: cell(4 + nextStep(), 6) };
      viewOf(BOARD, {}, { ruler });
    }),
    bench('a remote drag of a token that is no eye', () => {
      viewOf(BOARD, { [REMOTE_TOKEN_ID]: cell(5 + nextStep(), 6) });
    }),
    bench('the aura of one token changes', () => {
      viewOf(RESTYLED[nextStep()] ?? BOARD, {});
    }),
    bench("the viewer's eye walks one cell", () => {
      viewOf(BOARD, { [EYE_ID]: cell(2 + nextStep(), 2) });
    }),
    { time: 500, iterations: 20 },
  );
});

// The same changes at the ceiling of the table, 50 blockers of 48 vertices, on a board of its own:
// the cases above keep the historic numbers. Token 2 is nobody's eye, carries no light and blocks
// nothing; the first blocker stands in the range of the viewer's first eye.
const BLOCKED = stressBlockerBoardOf();
const OVERLAPPED = stressOverlappedBlockersBoardOf();
const OUTLINES = { outlines: STRESS_BLOCKER_OUTLINES };
const PLAIN_TOKEN_ID = stressId(1, 2);
const BLOCKER_ID = stressBlockerIds()[0] ?? '';

test('buildBoardView with 50 blockers', { timeout: 300_000 }, async ({ bench }) => {
  await bench.compare(
    bench('blockers: only the ruler changes', () => {
      const ruler = { from: cell(2, 2), to: cell(4 + nextStep(), 6) };
      viewOf(BLOCKED, {}, { ...OUTLINES, ruler });
    }),
    bench('blockers: a remote drag of a token that is no eye', () => {
      viewOf(BLOCKED, { [PLAIN_TOKEN_ID]: cell(7 + nextStep(), 3) }, OUTLINES);
    }),
    bench("blockers: the viewer's eye walks one cell", () => {
      viewOf(BLOCKED, { [EYE_ID]: cell(2 + nextStep(), 2) }, OUTLINES);
    }),
    bench('blockers: a blocker is dragged one cell', () => {
      viewOf(BLOCKED, { [BLOCKER_ID]: cell(5 + nextStep(), 6) }, OUTLINES);
    }),
    bench('blockers: a blocker with an image turns', () => {
      viewOf(BLOCKED, {}, { ...OUTLINES, facingPreview: { [BLOCKER_ID]: 90 * nextStep() } });
    }),
    bench('blockers: eye and light inside 2 overlapped blockers walk one cell', () => {
      viewOf(OVERLAPPED, { [EYE_ID]: cell(2 + nextStep(), 2) }, OUTLINES);
    }),
    { time: 500, iterations: 20 },
  );
});
