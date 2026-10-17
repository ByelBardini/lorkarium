import { describe, expect, it } from 'vitest';
import type { TokenView } from '@/renderer/board-view';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import {
  layerMenuTarget,
  marqueeRect,
  moveMarquee,
  startMarquee,
  tokensInMarquee,
} from '@/renderer/marquee';

const CELL = CELL_WORLD_SIZE;

function tokenView(overrides: Partial<TokenView> = {}): TokenView {
  return {
    id: 'lyra',
    initials: 'LY',
    ring: 'ally',
    col: 0,
    row: 0,
    size: 1,
    bar: null,
    layer: 'tokens',
    pickable: true,
    selected: false,
    draggable: true,
    onTurn: false,
    marks: [],
    moreMarks: false,
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

  it('takes a size 2 token it touches with only one of its cells', () => {
    const big = tokenView({ id: 'ogre', col: 2, row: 2, size: 2 });
    const rect = { x: 3 * CELL + 10, y: 3 * CELL + 10, width: CELL, height: CELL };
    expect(tokensInMarquee(rect, [big])).toEqual(['ogre']);
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

describe('layerMenuTarget', () => {
  it('a short right click on a pickable token, with the menu allowed, opens it on that token', () => {
    expect(layerMenuTarget({ layerMenu: true }, tokenView())).toBe('lyra');
  });

  it('a player (no menu) gets nothing', () => {
    expect(layerMenuTarget({ layerMenu: false }, tokenView())).toBeNull();
  });

  it('a right click on the empty board or on a token off the active layer opens nothing', () => {
    expect(layerMenuTarget({ layerMenu: true }, null)).toBeNull();
    expect(layerMenuTarget({ layerMenu: true }, tokenView({ pickable: false }))).toBeNull();
  });
});
