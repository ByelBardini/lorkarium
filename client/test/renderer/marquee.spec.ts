import { describe, expect, it } from 'vitest';
import type { TokenView } from '@/renderer/board-view';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { drawingViewsOf } from '@/renderer/drawing-view';
import { effectAreaViewsOf } from '@/renderer/effect-area-view';
import {
  drawingsInMarquee,
  effectAreasInMarquee,
  tokenMenuTarget,
  marqueeRect,
  marqueeTargetsOf,
  moveMarquee,
  startMarquee,
  tokensInMarquee,
} from '@/renderer/marquee';

import { path, SQUARE_ID, square } from '../support/drawing-fixtures';
import { ANA_CIRCLE_ID, BIA_CONE_ID, anaCircle, biaCone } from '../support/effect-area-fixtures';
import { VHARN_SCENE } from '../support/table-session-fixtures';
import { BIA_AT_TABLE } from '../support/table-session-fixtures';

const CELL = CELL_WORLD_SIZE;

function tokenView(overrides: Partial<TokenView> = {}): TokenView {
  return {
    id: 'lyra',
    name: 'lyra',
    initials: 'LY',
    ring: 'ally',
    col: 0,
    row: 0,
    width: 1,
    height: 1,
    bar: null,
    layer: 'tokens',
    pickable: true,
    selected: false,
    draggable: true,
    onTurn: false,
    conditions: [],
    looks: [],
    art: null,
    facing: 0,
    facingMark: true,
    defeated: false,
    hidden: false,
    silhouette: null,
    aura: null,
    ...overrides,
  };
}

describe('marquee', () => {
  it('a press that moves less than 4 px stays a click', () => {
    const marquee = moveMarquee(startMarquee({ x: 10, y: 10 }, { x: 10, y: 10 }), {
      screen: { x: 13, y: 10 },
      world: { x: 13, y: 10 },
    });
    expect(marquee.active).toBe(false);
  });

  it('from 4 px on the press draws a rectangle', () => {
    const marquee = moveMarquee(startMarquee({ x: 10, y: 10 }, { x: 10, y: 10 }), {
      screen: { x: 14, y: 10 },
      world: { x: 14, y: 10 },
    });
    expect(marquee.active).toBe(true);
  });

  it('dragged right to left and bottom to top, it is the same normalized rectangle', () => {
    const backwards = moveMarquee(startMarquee({ x: 300, y: 200 }, { x: 300, y: 200 }), {
      screen: { x: 100, y: 50 },
      world: { x: 100, y: 50 },
    });
    expect(marqueeRect(backwards)).toEqual({ x: 100, y: 50, width: 200, height: 150 });
  });

  it('takes a 2×2 token it touches with only one of its cells', () => {
    const big = tokenView({ id: 'ogre', col: 2, row: 2, width: 2, height: 2 });
    const rect = { x: 3 * CELL + 10, y: 3 * CELL + 10, width: CELL, height: CELL };
    expect(tokensInMarquee(rect, [big])).toEqual(['ogre']);
  });

  it('a 3×1 token is reached at its far right cell, and not one row below it', () => {
    const wide = tokenView({ id: 'horse', col: 2, row: 2, width: 3, height: 1 });
    const atRight = { x: 4 * CELL + 10, y: 2 * CELL + 10, width: 10, height: 10 };
    const below = { x: 4 * CELL + 10, y: 3 * CELL + 10, width: 10, height: 10 };
    expect(tokensInMarquee(atRight, [wide])).toEqual(['horse']);
    expect(tokensInMarquee(below, [wide])).toEqual([]);
  });

  it('leaves out a token it does not reach', () => {
    const far = tokenView({ id: 'far', col: 9, row: 9 });
    expect(tokensInMarquee({ x: 0, y: 0, width: CELL, height: CELL }, [far])).toEqual([]);
  });

  it('leaves out a token off the active layer and one the viewer may not move', () => {
    const chest = tokenView({ id: 'chest', pickable: false, draggable: false });
    const goblin = tokenView({ id: 'goblin', draggable: false });
    const mine = tokenView({ id: 'mine' });
    const all = { x: 0, y: 0, width: CELL, height: CELL };
    expect(tokensInMarquee(all, [chest, goblin, mine])).toEqual(['mine']);
  });
});

describe('tokenMenuTarget', () => {
  it('a short right click on a pickable token, with the menu allowed, opens it on that token', () => {
    expect(tokenMenuTarget({ layerMenu: true }, tokenView())).toBe('lyra');
  });

  it('a player gets the menu on a token they may move (Bia on her Lyra)', () => {
    expect(tokenMenuTarget({ layerMenu: false }, tokenView({ draggable: true }))).toBe('lyra');
  });

  it('a player gets nothing on a token of someone else (Caio on the Lyra of Bia)', () => {
    expect(tokenMenuTarget({ layerMenu: false }, tokenView({ draggable: false }))).toBeNull();
  });

  it('a right click on the empty board or on a token off the active layer opens nothing', () => {
    expect(tokenMenuTarget({ layerMenu: true }, null)).toBeNull();
    expect(tokenMenuTarget({ layerMenu: true }, tokenView({ pickable: false }))).toBeNull();
  });
});

describe('drawingsInMarquee', () => {
  const drawings = drawingViewsOf({
    drawings: [square(), path()],
    viewer: { userId: BIA_AT_TABLE.userId, isMaster: false },
    picking: true,
    selectedDrawingIds: [],
    drawingPreview: [],
    readOnly: false,
  });

  it('a rectangle that touches the box of a pickable drawing takes it', () => {
    const rect = { x: 4 * CELL_WORLD_SIZE, y: 4.5 * CELL_WORLD_SIZE, width: 64, height: 64 };

    expect(drawingsInMarquee(rect, drawings)).toEqual([SQUARE_ID]);
  });

  it('a drawing the viewer may not pick up is left out even inside the rectangle', () => {
    const everything = { x: 0, y: 0, width: 20 * CELL_WORLD_SIZE, height: 12 * CELL_WORLD_SIZE };

    expect(drawingsInMarquee(everything, drawings)).toEqual([SQUARE_ID]);
  });

  it('a rectangle away from every drawing takes none', () => {
    const rect = { x: 12 * CELL_WORLD_SIZE, y: 8 * CELL_WORLD_SIZE, width: 64, height: 64 };

    expect(drawingsInMarquee(rect, drawings)).toEqual([]);
  });
});

describe('effectAreasInMarquee', () => {
  function areaViews(isMaster: boolean) {
    return effectAreaViewsOf({
      effectAreas: [biaCone(), anaCircle({ kind: 'smooth_circle', x: 15, y: 5, reach: 1 })],
      viewer: { userId: BIA_AT_TABLE.userId, isMaster },
      activeLayer: 'tokens',
      selectedEffectAreaIds: [],
      effectAreaPreview: {},
      readOnly: false,
      scene: VHARN_SCENE,
    });
  }

  function rectOf(x: number, y: number, width: number, height: number) {
    return { x: x * CELL, y: y * CELL, width: width * CELL, height: height * CELL };
  }

  it('a rectangle touching one painted cell takes the grid area', () => {
    expect(effectAreasInMarquee(rectOf(7.8, 7.8, 1, 1), areaViews(true))).toEqual([BIA_CONE_ID]);
  });

  it('a rectangle over a cell the cone does not paint takes nothing', () => {
    expect(effectAreasInMarquee(rectOf(4, 7.2, 1.5, 0.5), areaViews(true))).toEqual([]);
  });

  it('a smooth area is taken by its box', () => {
    expect(effectAreasInMarquee(rectOf(15.8, 5.8, 1, 1), areaViews(true))).toEqual([ANA_CIRCLE_ID]);
  });

  it('only the areas the viewer may pick: Bia does not take the master’s', () => {
    expect(effectAreasInMarquee(rectOf(0, 0, 20, 12), areaViews(false))).toEqual([BIA_CONE_ID]);
  });
});

describe('marqueeTargetsOf', () => {
  const everything = { x: 0, y: 0, width: 20 * CELL, height: 12 * CELL };
  const asMaster = { userId: 'ana', isMaster: true };

  function targetsWith(tool: 'select' | 'draw') {
    const drawings = drawingViewsOf({
      drawings: [square()],
      viewer: asMaster,
      picking: tool === 'draw',
      selectedDrawingIds: [],
      drawingPreview: [],
      readOnly: false,
    });
    const effectAreas = effectAreaViewsOf({
      effectAreas: [biaCone()],
      viewer: asMaster,
      activeLayer: 'tokens',
      selectedEffectAreaIds: [],
      effectAreaPreview: {},
      readOnly: false,
      scene: VHARN_SCENE,
    });
    return marqueeTargetsOf(everything, { tool, tokens: [tokenView()], drawings, effectAreas });
  }

  it('with Selecionar it takes the token and the area under it, never the drawing', () => {
    expect(targetsWith('select')).toEqual({
      tokenIds: ['lyra'],
      drawingIds: [],
      effectAreaIds: [BIA_CONE_ID],
    });
  });

  it('with the draw tool in Selecionar it takes only the drawing, not the token nor the area', () => {
    expect(targetsWith('draw')).toEqual({
      tokenIds: [],
      drawingIds: [SQUARE_ID],
      effectAreaIds: [],
    });
  });
});
