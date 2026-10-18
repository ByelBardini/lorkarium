import { describe, expect, it } from 'vitest';
import type { TokenView } from '@/renderer/board-view';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import {
  HANDLE_GAP,
  facingFromDrag,
  handleAt,
  handlePointOf,
  handleTokenOf,
} from '@/renderer/facing-handle';

const CELL = CELL_WORLD_SIZE;

function kael(overrides: Partial<TokenView> = {}): TokenView {
  return {
    id: 'kael',
    initials: 'KA',
    ring: 'ally',
    col: 2,
    row: 2,
    size: 1,
    bar: null,
    layer: 'tokens',
    pickable: true,
    selected: true,
    draggable: true,
    onTurn: false,
    marks: [],
    moreMarks: 0,
    art: null,
    facing: 0,
    ...overrides,
  };
}

const CENTER = { x: 2 * CELL + CELL / 2, y: 2 * CELL + CELL / 2 };

describe('handlePointOf', () => {
  it('a token looking down (0) has its handle below its center, past the edge', () => {
    const point = handlePointOf(kael());

    expect(point.x).toBeCloseTo(CENTER.x);
    expect(point.y).toBeCloseTo(CENTER.y + CELL / 2 + HANDLE_GAP);
  });

  it('a token looking left (90) has its handle to the left', () => {
    const point = handlePointOf(kael({ facing: 90 }));

    expect(point.x).toBeCloseTo(CENTER.x - CELL / 2 - HANDLE_GAP);
    expect(point.y).toBeCloseTo(CENTER.y);
  });
});

describe('handleAt', () => {
  it('a press on the handle takes it, and one on the token does not', () => {
    const handle = handlePointOf(kael());

    expect(handleAt(kael(), { x: handle.x + 3, y: handle.y - 3 })).toBe(true);
    expect(handleAt(kael(), CENTER)).toBe(false);
  });
});

describe('facingFromDrag', () => {
  it('dragging the handle to the left of the token turns it to 90', () => {
    expect(facingFromDrag(kael(), { x: CENTER.x - 50, y: CENTER.y }, 0, false)).toBe(90);
  });

  it('with Shift, 100° snaps to 90', () => {
    const at100 = { x: CENTER.x - Math.sin(1.745) * 50, y: CENTER.y + Math.cos(1.745) * 50 };

    expect(facingFromDrag(kael(), at100, 0, false)).toBe(100);
    expect(facingFromDrag(kael(), at100, 0, true)).toBe(90);
  });

  it('a pointer right over the center keeps the current facing', () => {
    expect(facingFromDrag(kael(), CENTER, 135, false)).toBe(135);
  });
});

describe('handleTokenOf', () => {
  it('the one selected token this viewer may move shows the handle', () => {
    expect(handleTokenOf({ tool: 'select', tokens: [kael()] })?.id).toBe('kael');
  });

  it('a token that is not draggable shows none', () => {
    expect(handleTokenOf({ tool: 'select', tokens: [kael({ draggable: false })] })).toBeNull();
  });

  it('two selected tokens show none', () => {
    const tokens = [kael(), kael({ id: 'lyra' })];

    expect(handleTokenOf({ tool: 'select', tokens })).toBeNull();
  });

  it('with the ruler there is no handle', () => {
    expect(handleTokenOf({ tool: 'ruler', tokens: [kael()] })).toBeNull();
  });
});
