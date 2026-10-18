import { describe, expect, it } from 'vitest';
import type { BoardView, TokenView } from '@/renderer/board-view';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import {
  resizeCursorOf,
  resizeFromDrag,
  resizeHandleAt,
  resizeHandlePoints,
  resizeTokenOf,
} from '@/renderer/resize-handles';

const C = CELL_WORLD_SIZE;
const SCENE = { widthCells: 20, heightCells: 12 };

function tokenView(overrides: Partial<TokenView> = {}): TokenView {
  return {
    id: 'horse',
    name: 'Cavalo',
    initials: 'CA',
    ring: 'ally',
    col: 1,
    row: 1,
    width: 2,
    height: 1,
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
    facingMark: true,
    ...overrides,
  };
}

function viewWith(tokens: TokenView[], tool: BoardView['tool'] = 'select') {
  return { tokens, tool };
}

describe('resizeTokenOf', () => {
  it('the one selected token this viewer may move shows the handles', () => {
    expect(resizeTokenOf(viewWith([tokenView()]))?.id).toBe('horse');
  });

  it('a token of someone else, a group, or another tool shows none', () => {
    expect(resizeTokenOf(viewWith([tokenView({ draggable: false })]))).toBeNull();
    expect(resizeTokenOf(viewWith([tokenView(), tokenView({ id: 'rat' })]))).toBeNull();
    expect(resizeTokenOf(viewWith([tokenView()], 'ruler'))).toBeNull();
  });
});

describe('resizeHandlePoints', () => {
  it('a 2×1 token at (1, 1) has its corners and the middle of each side', () => {
    expect(resizeHandlePoints(tokenView())).toEqual({
      nw: { x: C, y: C },
      n: { x: 2 * C, y: C },
      ne: { x: 3 * C, y: C },
      e: { x: 3 * C, y: 1.5 * C },
      se: { x: 3 * C, y: 2 * C },
      s: { x: 2 * C, y: 2 * C },
      sw: { x: C, y: 2 * C },
      w: { x: C, y: 1.5 * C },
    });
  });
});

describe('resizeHandleAt', () => {
  it('a press within reach of the south-east corner takes it', () => {
    expect(resizeHandleAt(tokenView(), { x: 3 * C + 4, y: 2 * C - 3 }, 8)).toBe('se');
  });

  it('a press in the middle of the token takes no handle', () => {
    expect(resizeHandleAt(tokenView(), { x: 2 * C, y: 1.5 * C }, 8)).toBeNull();
  });

  it('the reach is in world px: zoomed out, the same press is farther', () => {
    expect(resizeHandleAt(tokenView(), { x: 3 * C + 12, y: 2 * C }, 8)).toBeNull();
    expect(resizeHandleAt(tokenView(), { x: 3 * C + 12, y: 2 * C }, 16)).toBe('se');
  });
});

describe('resizeFromDrag', () => {
  it('the east handle dragged a cell and a half widens the token by 1.5', () => {
    const start = { x: 3 * C, y: 1.5 * C };
    const box = resizeFromDrag(SCENE, tokenView(), 'e', start, { x: 4.5 * C, y: 1.5 * C });
    expect(box).toEqual({ col: 1, row: 1, width: 3.5, height: 1 });
  });

  it('the south-east corner dragged out scales both sides keeping 2:1', () => {
    const start = { x: 3 * C, y: 2 * C };
    const box = resizeFromDrag(SCENE, tokenView(), 'se', start, { x: 5 * C, y: 3 * C });
    expect(box).toEqual({ col: 1, row: 1, width: 4, height: 2 });
  });

  it('the west handle dragged left moves the origin and keeps the east side', () => {
    const start = { x: C, y: 1.5 * C };
    const box = resizeFromDrag(SCENE, tokenView(), 'w', start, { x: 0, y: 1.5 * C });
    expect(box).toEqual({ col: 0, row: 1, width: 3, height: 1 });
  });
});

describe('resizeFromDrag while dragging (free step)', () => {
  it('the east handle dragged 10 px widens the preview by exactly 10 px, no jump to half a cell', () => {
    const start = { x: 3 * C, y: 1.5 * C };
    const box = resizeFromDrag(SCENE, tokenView(), 'e', start, { x: 3 * C + 10, y: 1.5 * C }, 0);
    expect(box.width * C).toBeCloseTo(2 * C + 10, 6);
  });

  it('the same 10 px released snap back to the 2 cells it had', () => {
    const start = { x: 3 * C, y: 1.5 * C };
    const box = resizeFromDrag(SCENE, tokenView(), 'e', start, { x: 3 * C + 10, y: 1.5 * C });
    expect(box.width).toBe(2);
  });
});

describe('resizeCursorOf', () => {
  it.each([
    ['n', 'ns-resize'],
    ['e', 'ew-resize'],
    ['ne', 'nesw-resize'],
    ['nw', 'nwse-resize'],
    ['se', 'nwse-resize'],
    ['sw', 'nesw-resize'],
  ] as const)('the %s handle shows %s', (handle, cursor) => {
    expect(resizeCursorOf(handle)).toBe(cursor);
  });
});
