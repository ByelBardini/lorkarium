import type { TokenDto, WallDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAWING_STYLE } from '@/lib/drawing-style';
import type { TokenLanding } from '@/lib/light-sources';
import { sightGeometryOf, type SightOutlines } from '@/lib/sight-geometry';
import { buildBoardView, type BoardViewInput } from '@/renderer/board-view';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import {
  sightBlockerOutlineDashesOf,
  sightBlockerOutlineViewOf,
  type SightBlockerOutlineView,
} from '@/renderer/sight-blocker-outline-view';
import { KAEL_ID, LYRA_ID, VHARN_SCENE, kael, lyra } from '../support/table-session-fixtures';

const CELL = CELL_WORLD_SIZE;
const STATUE_IMAGE = '11112222-3333-4444-8555-666677778888';
const NO_WALLS: readonly WallDto[] = [];
const TRIANGLE = [
  [
    [0.5, 0],
    [1, 1],
    [0, 1],
  ],
] as const;
const OUTLINES: SightOutlines = new Map([[STATUE_IMAGE, TRIANGLE]]);
// A 2×2 statue at (3, 3), cut as a triangle.
const STATUE = lyra({
  col: 3,
  row: 3,
  width: 2,
  height: 2,
  facing: 0,
  blocksSight: true,
  imageAssetId: STATUE_IMAGE,
});
const MASTER = { isMaster: true };

type Pose = Readonly<{
  viewer?: Readonly<{ isMaster: boolean }>;
  tokens?: readonly TokenDto[];
  selected?: readonly string[];
  landing?: TokenLanding;
}>;

function outlineOf(pose: Pose = {}): SightBlockerOutlineView | null {
  const board = { scene: VHARN_SCENE, tokens: pose.tokens ?? [STATUE], walls: NO_WALLS };
  const { blockers } = sightGeometryOf(board, OUTLINES, pose.landing);
  return sightBlockerOutlineViewOf({
    viewer: pose.viewer ?? MASTER,
    blockers,
    selectedTokenIds: pose.selected ?? [LYRA_ID],
  });
}

function inCells(view: SightBlockerOutlineView | null | undefined) {
  return view?.polygons.map((polygon) =>
    polygon.map(({ x, y }) => [+(x / CELL).toFixed(6), +(y / CELL).toFixed(6)]),
  );
}

describe('sightBlockerOutlineViewOf', () => {
  it('the master with the statue selected alone gets its shape, in world px', () => {
    expect(outlineOf()?.polygons).toEqual([
      [
        { x: 4 * CELL, y: 3 * CELL },
        { x: 5 * CELL, y: 5 * CELL },
        { x: 3 * CELL, y: 5 * CELL },
      ],
    ]);
  });

  it('an image with no outline yet shows the rectangle it blocks by', () => {
    const statue = { ...STATUE, imageAssetId: 'aaaabbbb-cccc-4ddd-8eee-ffff00001111' };

    expect(inCells(outlineOf({ tokens: [statue] }))).toEqual([
      [
        [3, 3],
        [5, 3],
        [5, 5],
        [3, 5],
      ],
    ]);
  });

  it('turned by 90°, the line turns around the center with the art', () => {
    expect(inCells(outlineOf({ tokens: [{ ...STATUE, facing: 90 }] }))).toEqual([
      [
        [5, 4],
        [3, 5],
        [3, 3],
      ],
    ]);
  });

  it('dragged, the line follows the pose shown before the server answers', () => {
    const landing: TokenLanding = new Map([[LYRA_ID, { col: 6, row: 7, facing: 0 }]]);

    expect(inCells(outlineOf({ landing }))).toEqual([
      [
        [7, 7],
        [8, 9],
        [6, 9],
      ],
    ]);
  });

  it('two tokens selected show no line', () => {
    const tokens = [STATUE, kael({ blocksSight: true })];

    expect(outlineOf({ tokens, selected: [LYRA_ID, KAEL_ID] })).toBeNull();
  });

  it('nothing selected shows no line', () => {
    expect(outlineOf({ selected: [] })).toBeNull();
  });

  it('a player, or the spectator, who has no master role, gets no line', () => {
    expect(outlineOf({ viewer: { isMaster: false } })).toBeNull();
  });

  it('a token selected without the switch shows no line, even beside a blocker', () => {
    expect(outlineOf({ tokens: [STATUE, kael()], selected: [KAEL_ID] })).toBeNull();
  });

  it('an invisible blocker, which is not blocking now, shows no line', () => {
    expect(outlineOf({ tokens: [{ ...STATUE, hidden: true }] })).toBeNull();
  });

  it('a board rebuilt with the blocker in the same pose hands back the very same view', () => {
    const first = outlineOf();
    const second = outlineOf({ tokens: [{ ...STATUE }, kael()] });

    expect(first).not.toBeNull();
    expect(second).toBe(first);
  });
});

describe('sightBlockerOutlineDashesOf', () => {
  const SQUARE: SightBlockerOutlineView = {
    polygons: [
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
    ],
  };

  function drawnShare(view: SightBlockerOutlineView, zoom: number, perimeter: number): number {
    const drawn = sightBlockerOutlineDashesOf(view, zoom).reduce(
      (sum, { from, to }) => sum + Math.hypot(to.x - from.x, to.y - from.y),
      0,
    );
    return drawn / perimeter;
  }

  it('goes round the closed shape with a dash of 6 screen px and a gap of 4', () => {
    const dashes = sightBlockerOutlineDashesOf(SQUARE, 1);

    expect(dashes[0]).toEqual({ from: { x: 0, y: 0 }, to: { x: 6, y: 0 } });
    expect(dashes[1]).toEqual({ from: { x: 10, y: 0 }, to: { x: 16, y: 0 } });
    expect(dashes.at(-1)?.from).toEqual({ x: 0, y: 10 });
    expect(drawnShare(SQUARE, 1, 400)).toBeCloseTo(0.6, 2);
  });

  it('keeps its length on screen: at zoom 2 a dash is 3 world px', () => {
    expect(sightBlockerOutlineDashesOf(SQUARE, 2)[0]).toEqual({
      from: { x: 0, y: 0 },
      to: { x: 3, y: 0 },
    });
  });

  it('a dash carries over a corner instead of starting again at each vertex', () => {
    const elbow: SightBlockerOutlineView = {
      polygons: [
        [
          { x: 0, y: 0 },
          { x: 93, y: 0 },
          { x: 93, y: 93 },
        ],
      ],
    };

    const afterCorner = sightBlockerOutlineDashesOf(elbow, 1).find(
      ({ from }) => from.x === 93 && from.y === 0,
    );

    // 90 starts the last dash of the first side: 3 px on it, the other 3 down the second.
    expect(afterCorner?.to).toEqual({ x: 93, y: 3 });
  });

  it('a shape of many short sides, far out, keeps its gaps instead of closing into a solid line', () => {
    const round = outlineOf({
      tokens: [lyra({ col: 3, row: 3, frame: 'round', blocksSight: true })],
    });
    const ring = round?.polygons[0] ?? [];
    const perimeter = ring.reduce((sum, point, index) => {
      const next = ring[(index + 1) % ring.length] ?? point;
      return sum + Math.hypot(next.x - point.x, next.y - point.y);
    }, 0);

    expect(ring.length).toBeGreaterThan(8);
    expect(round && drawnShare(round, 0.25, perimeter)).toBeCloseTo(0.6, 1);
  });

  it('a side of no length, held on the scene border, adds no dash', () => {
    const point = { x: 5, y: 5 };

    expect(sightBlockerOutlineDashesOf({ polygons: [[point, point, point]] }, 1)).toEqual([]);
  });
});

describe('buildBoardView, the line of the blocker', () => {
  const INPUT: BoardViewInput = {
    scene: VHARN_SCENE,
    localGridVisible: true,
    ruler: null,
    tokens: [STATUE],
    selectedTokenIds: [LYRA_ID],
    activeLayer: 'tokens',
    canChooseLayer: true,
    preview: [],
    facingPreview: {},
    resizePreview: {},
    drag: null,
    dragged: {},
    readOnly: false,
    tool: 'select',
    currentTokenIds: [],
    drawings: [],
    viewer: { userId: 'ana', isMaster: true },
    selectedDrawingIds: [],
    drawingPreview: [],
    drawingStyle: DEFAULT_DRAWING_STYLE,
    sightOutlines: OUTLINES,
  };

  it('the master gets the outline by the outlines known', () => {
    expect(inCells(buildBoardView(INPUT).sightBlockerOutline)).toEqual([
      [
        [4, 3],
        [5, 5],
        [3, 5],
      ],
    ]);
  });

  it('a player gets null', () => {
    const view = buildBoardView({ ...INPUT, viewer: { userId: 'bia', isMaster: false } });

    expect(view.sightBlockerOutline).toBeNull();
  });

  it('someone dragging it moves the line where the token shows', () => {
    const view = buildBoardView({ ...INPUT, dragged: { [LYRA_ID]: { col: 6, row: 7 } } });

    expect(inCells(view.sightBlockerOutline)).toEqual([
      [
        [7, 7],
        [8, 9],
        [6, 9],
      ],
    ]);
  });

  it('a board with no walls passed keeps the same line across builds', () => {
    const first = buildBoardView(INPUT).sightBlockerOutline;

    expect(first).not.toBeNull();
    expect(buildBoardView(INPUT).sightBlockerOutline).toBe(first);
  });
});
