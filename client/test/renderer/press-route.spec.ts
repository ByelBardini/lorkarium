import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAWING_STYLE } from '@/lib/drawing-style';
import { buildBoardView, type BoardView } from '@/renderer/board-view';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { hoverRouteOf, pressRouteOf, topTokenAt } from '@/renderer/press-route';
import { SQUARE_ID, square } from '../support/drawing-fixtures';
import { BIA_CONE_ID, biaCone } from '../support/effect-area-fixtures';
import { BIA_AT_TABLE, LYRA_ID, VHARN_SCENE, lyra } from '../support/table-session-fixtures';

const CELL = CELL_WORLD_SIZE;

function boardView(overrides: Partial<Parameters<typeof buildBoardView>[0]> = {}): BoardView {
  return buildBoardView({
    scene: VHARN_SCENE,
    localGridVisible: true,
    ruler: null,
    tokens: [lyra()],
    selectedTokenIds: [],
    activeLayer: 'tokens',
    canChooseLayer: false,
    preview: [],
    facingPreview: {},
    resizePreview: {},
    drag: null,
    dragged: {},
    readOnly: false,
    tool: 'select',
    currentTokenId: null,
    drawings: [square()],
    viewer: { userId: BIA_AT_TABLE.userId, isMaster: false },
    selectedDrawingIds: [],
    drawingPreview: [],
    drawingStyle: DEFAULT_DRAWING_STYLE,
    ...overrides,
  });
}

// World px of a point given in cells.
function at(x: number, y: number) {
  return { x: x * CELL, y: y * CELL };
}

// Lyra (3, 4) 1×1 looking right: the facing handle sits 20 px past her right edge.
const LYRA_FACING_HANDLE = { x: 4 * CELL + 20, y: 4.5 * CELL };
const LYRA_SE_CORNER = at(4, 5);

describe('pressRouteOf with the select tool', () => {
  it('the facing handle over the token wins the press', () => {
    const view = boardView({ selectedTokenIds: [LYRA_ID] });
    expect(pressRouteOf(view, LYRA_FACING_HANDLE, 1).kind).toBe('facingHandle');
  });

  it('a resize square of the selected token takes the press before the token', () => {
    const view = boardView({ selectedTokenIds: [LYRA_ID] });
    expect(pressRouteOf(view, LYRA_SE_CORNER, 1).kind).toBe('resizeHandle');
  });

  it('a pickable token over a drawing takes the press', () => {
    expect(pressRouteOf(boardView(), at(3.5, 4.5), 1)).toMatchObject({
      kind: 'token',
      token: { id: LYRA_ID },
    });
  });

  it('a drawing with no token over it takes the press', () => {
    expect(pressRouteOf(boardView(), at(2.7, 3.2), 1)).toMatchObject({
      kind: 'drawing',
      drawing: { id: SQUARE_ID },
    });
  });

  it('a press on the empty board starts the marquee', () => {
    expect(pressRouteOf(boardView(), at(10, 10), 1).kind).toBe('marquee');
  });

  it('with no selection, the spot of the facing handle goes to the drawing beneath it', () => {
    expect(pressRouteOf(boardView(), LYRA_FACING_HANDLE, 1).kind).toBe('drawing');
  });
});

describe('pressRouteOf and the areas of effect', () => {
  // Bia's cone paints (6, 5) … (7, 7); Lyra stands on (3, 4) and the square covers (2.5, 3)–(4.5, 5).
  it('a pickable area with nothing over it takes the press before the marquee', () => {
    const view = boardView({ effectAreas: [biaCone()] });
    expect(pressRouteOf(view, at(7.5, 6.5), 1)).toMatchObject({
      kind: 'effectArea',
      area: { id: BIA_CONE_ID },
    });
  });

  it('a token over the area wins the press', () => {
    const view = boardView({ effectAreas: [biaCone()], tokens: [lyra({ col: 7, row: 6 })] });
    expect(pressRouteOf(view, at(7.5, 6.5), 1).kind).toBe('token');
  });

  it('a drawing of the Tokens layer over the area wins the press', () => {
    const view = boardView({ effectAreas: [biaCone()], drawings: [square({ x: 6, y: 6 })] });
    expect(pressRouteOf(view, at(7, 7), 1).kind).toBe('drawing');
  });

  it('on the Objects layer the area is not taken: the press starts the marquee', () => {
    const view = boardView({
      effectAreas: [biaCone()],
      activeLayer: 'objects',
      canChooseLayer: true,
    });
    expect(pressRouteOf(view, at(7.5, 6.5), 1).kind).toBe('marquee');
  });
});

describe('pressRouteOf with other tools', () => {
  it('with the draw tool any press starts a sketch, even over a token', () => {
    expect(pressRouteOf(boardView({ tool: 'draw' }), at(3.5, 4.5), 1).kind).toBe('sketch');
  });

  it('with the area tool any press starts an area, even over a token', () => {
    expect(pressRouteOf(boardView({ tool: 'area' }), at(3.5, 4.5), 1).kind).toBe('areaSketch');
  });

  it('with the ruler no select route is taken, even over a token', () => {
    expect(pressRouteOf(boardView({ tool: 'ruler' }), at(3.5, 4.5), 1).kind).toBe('pointer');
  });
});

describe('topTokenAt and hoverRouteOf', () => {
  it('the token drawn last wins where two overlap', () => {
    const view = boardView({ tokens: [lyra(), lyra({ id: 'other', name: 'Outra' })] });
    expect(topTokenAt(view.tokens, at(3.5, 4.5))?.id).toBe('other');
  });

  it('a token off the active layer is not under the pointer', () => {
    const view = boardView({ tokens: [lyra({ layer: 'objects' })] });
    expect(topTokenAt(view.tokens, at(3.5, 4.5))).toBeNull();
  });

  it('hovering a resize square shows its stretch handle and the token under it', () => {
    const view = boardView({ selectedTokenIds: [LYRA_ID] });
    const insideTheEastEdge = { x: 4 * CELL - 2, y: 4.5 * CELL };
    expect(hoverRouteOf(view, insideTheEastEdge, 1)).toEqual({ tokenId: LYRA_ID, handle: 'e' });
  });

  it('hovering the empty board shows no token and no handle', () => {
    expect(hoverRouteOf(boardView(), at(10, 10), 1)).toEqual({ tokenId: null, handle: null });
  });
});
