import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAWING_STYLE } from '@/lib/drawing-style';
import { buildBoardView, type BoardView } from '@/renderer/board-view';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { hoverRouteOf, menuRouteOf, pressRouteOf, topTokenAt } from '@/renderer/press-route';
import { SQUARE_ID, square } from '../support/drawing-fixtures';
import { BIA_CONE_ID, biaCone } from '../support/effect-area-fixtures';
import { BIA_AT_TABLE, LYRA_ID, VHARN_SCENE, lyra } from '../support/table-session-fixtures';
import { CELL_DOOR_ID, NORTH_WALL_ID, cellDoor, northWall } from '../support/wall-fixtures';
import { CORRIDOR_TORCH_ID, corridorTorch } from '../support/light-fixtures';

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
    currentTokenIds: [],
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

  it('a drawing is never taken: a press on it with no token over it starts the marquee', () => {
    expect(pressRouteOf(boardView(), at(2.7, 3.2), 1).kind).toBe('marquee');
  });

  it('a press on the empty board starts the marquee', () => {
    expect(pressRouteOf(boardView(), at(10, 10), 1).kind).toBe('marquee');
  });

  it('with no selection, the spot of the facing handle goes to the board beneath it', () => {
    expect(pressRouteOf(boardView(), LYRA_FACING_HANDLE, 1).kind).toBe('marquee');
  });
});

describe('pressRouteOf with the draw tool', () => {
  const picking = (overrides: Partial<Parameters<typeof buildBoardView>[0]> = {}) =>
    boardView({ tool: 'draw', drawMode: 'select', ...overrides });

  it('in Desenhar any press starts a sketch, even over a token or a drawing', () => {
    const drawing = boardView({ tool: 'draw', drawMode: 'draw' });
    expect(pressRouteOf(drawing, at(3.5, 4.5), 1).kind).toBe('sketch');
    expect(pressRouteOf(drawing, at(2.7, 3.2), 1).kind).toBe('sketch');
  });

  it('in Selecionar a press on her drawing takes it', () => {
    expect(pressRouteOf(picking(), at(2.7, 3.2), 1)).toMatchObject({
      kind: 'drawing',
      drawing: { id: SQUARE_ID },
    });
  });

  it('in Selecionar the token over the drawing is inert: the drawing under it takes the press', () => {
    expect(pressRouteOf(picking(), at(3.5, 4.5), 1)).toMatchObject({
      kind: 'drawing',
      drawing: { id: SQUARE_ID },
    });
  });

  it('in Selecionar a press on a token alone or on the empty board starts the marquee', () => {
    const lyraAlone = picking({ tokens: [lyra({ col: 10, row: 10 })] });
    expect(pressRouteOf(lyraAlone, at(10.5, 10.5), 1).kind).toBe('marquee');
    expect(pressRouteOf(picking(), at(15, 2), 1).kind).toBe('marquee');
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

  it('a drawing over the area does not take the press with Selecionar: the area does', () => {
    const view = boardView({ effectAreas: [biaCone()], drawings: [square({ x: 6, y: 6 })] });
    expect(pressRouteOf(view, at(7, 7), 1).kind).toBe('effectArea');
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
  it('with the area tool any press starts an area, even over a token', () => {
    expect(pressRouteOf(boardView({ tool: 'area' }), at(3.5, 4.5), 1).kind).toBe('areaSketch');
  });

  it('with the lights tool a press on the empty board puts a light there, even over a token', () => {
    expect(pressRouteOf(boardView({ tool: 'lights' }), at(3.5, 4.5), 1)).toEqual({
      kind: 'light',
      lightId: null,
    });
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

describe('pressRouteOf with the walls tool', () => {
  const master = { userId: BIA_AT_TABLE.userId, isMaster: true };

  const walls = (wallMode: 'draw' | 'eraseArea' | 'eraseWall' | 'eraseSegment') =>
    boardView({ tool: 'walls', wallMode, viewer: master, walls: [northWall()] });

  it('drawing, a press on a wall starts a new wall there: walls chain from each other', () => {
    expect(pressRouteOf(walls('draw'), at(4, 2.1), 1).kind).toBe('sketch');
  });

  it('erasing an area, a press anywhere (on a wall too) starts the eraser box', () => {
    expect(pressRouteOf(walls('eraseArea'), at(4, 2.1), 1).kind).toBe('sketch');
    expect(pressRouteOf(walls('eraseArea'), at(4, 6), 1).kind).toBe('sketch');
  });

  it('erasing the wall names it whole; erasing a piece names its segment', () => {
    expect(pressRouteOf(walls('eraseWall'), at(4, 2.1), 1)).toEqual({
      kind: 'wallErase',
      wallId: NORTH_WALL_ID,
      segmentIndex: null,
    });
    expect(pressRouteOf(walls('eraseSegment'), at(4, 2.1), 1)).toEqual({
      kind: 'wallErase',
      wallId: NORTH_WALL_ID,
      segmentIndex: 0,
    });
  });
});

describe('pressRouteOf and the doors', () => {
  it('the icon of a door the viewer sees wins the press over the token under it', () => {
    const view = boardView({
      tokens: [lyra({ col: 6.5, row: 5 })],
      walls: [cellDoor()],
      seenDoorIds: new Set([CELL_DOOR_ID]),
    });
    const route = pressRouteOf(view, { x: 7 * CELL, y: 5.5 * CELL }, 1);

    expect(route).toEqual({ kind: 'door', wallId: CELL_DOOR_ID });
  });

  it('a door the viewer does not see is not pressed: the token under it is', () => {
    const view = boardView({
      tokens: [lyra({ col: 6.5, row: 5 })],
      walls: [cellDoor()],
      seenDoorIds: new Set<string>(),
    });

    expect(pressRouteOf(view, { x: 7 * CELL, y: 5.5 * CELL }, 1).kind).toBe('token');
  });
});

describe('menuRouteOf, the short right click', () => {
  const doorOverLyra = { tokens: [lyra({ col: 6.5, row: 5 })], walls: [cellDoor()] };
  const ON_THE_DOOR = { x: 7 * CELL, y: 5.5 * CELL };

  it('for the master the door icon wins over the token in the doorway', () => {
    const view = boardView({ ...doorOverLyra, canChooseLayer: true });

    expect(menuRouteOf(view, ON_THE_DOOR, 1)).toEqual({ kind: 'door', wallId: CELL_DOOR_ID });
  });

  it('for a player the door has no menu: the token they control gets it', () => {
    const view = boardView({ ...doorOverLyra, seenDoorIds: new Set([CELL_DOOR_ID]) });

    expect(menuRouteOf(view, ON_THE_DOOR, 1)).toEqual({ kind: 'token', tokenId: LYRA_ID });
  });

  it('the empty board opens nothing', () => {
    expect(menuRouteOf(boardView(), at(15, 10), 1)).toBeNull();
  });
});

describe('menuRouteOf and the map lights', () => {
  // The torch stands on the corner of Lyra at (7, 5) and on the cell door at x = 7.
  const ON_THE_TORCH = { x: 7 * CELL, y: 5.5 * CELL };
  const master = { userId: 'ana', isMaster: true };

  function masterView(more: Partial<Parameters<typeof buildBoardView>[0]> = {}): BoardView {
    return boardView({
      viewer: master,
      canChooseLayer: true,
      lights: [corridorTorch({ x: 7, y: 5.5 })],
      ...more,
    });
  }

  it('the master right clicking the icon of a light gets the light menu', () => {
    expect(menuRouteOf(masterView({ tokens: [] }), ON_THE_TORCH, 1)).toEqual({
      kind: 'light',
      lightId: CORRIDOR_TORCH_ID,
    });
  });

  it('the light wins over the token under it', () => {
    const view = masterView({ tokens: [lyra({ col: 6.5, row: 5 })] });

    expect(menuRouteOf(view, ON_THE_TORCH, 1)?.kind).toBe('light');
  });

  it('the door wins over the light on it', () => {
    const view = masterView({ tokens: [], walls: [cellDoor()] });

    expect(menuRouteOf(view, ON_THE_TORCH, 1)).toEqual({ kind: 'door', wallId: CELL_DOOR_ID });
  });
});

describe('pressRouteOf and the handle of a spotlight', () => {
  // The spotlight at (5, 5) looks down (90): its handle stands 16 + 20 px under the icon.
  const spotlightPicked = boardView({
    tool: 'lights',
    viewer: { userId: BIA_AT_TABLE.userId, isMaster: true },
    lights: [corridorTorch({ facing: 90, angle: 60 })],
    selectedLightIds: [CORRIDOR_TORCH_ID],
  });

  it('with the lights tool, a press on the handle takes the handle', () => {
    const handle = { x: 5 * CELL, y: 5 * CELL + 36 };

    expect(pressRouteOf(spotlightPicked, handle, 1)).toEqual({ kind: 'facingHandle' });
  });

  it('a press on the icon takes the light, and on the empty board puts one', () => {
    expect(pressRouteOf(spotlightPicked, at(5, 5), 1)).toEqual({
      kind: 'light',
      lightId: CORRIDOR_TORCH_ID,
    });
    expect(pressRouteOf(spotlightPicked, at(12, 2), 1)).toEqual({ kind: 'light', lightId: null });
  });
});
