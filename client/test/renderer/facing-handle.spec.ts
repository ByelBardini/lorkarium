import { describe, expect, it } from 'vitest';
import type { TokenView } from '@/renderer/board-view';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import {
  HANDLE_GAP,
  facingFromDrag,
  handleAt,
  handlePointOf,
  handleStemOf,
  handleTokenOf,
  facingTargetOf,
  tokenFacingTarget,
} from '@/renderer/facing-handle';

const CELL = CELL_WORLD_SIZE;

function kael(overrides: Partial<TokenView> = {}): TokenView {
  return {
    id: 'kael',
    name: 'kael',
    initials: 'KA',
    ring: 'ally',
    col: 2,
    row: 2,
    width: 1,
    height: 1,
    bar: null,
    layer: 'tokens',
    pickable: true,
    selected: true,
    draggable: true,
    onTurn: false,
    conditions: [],
    looks: [],
    art: null,
    facing: 0,
    facingMark: true,
    defeated: false,
    silhouette: null,
    ...overrides,
  };
}

const CENTER = { x: 2 * CELL + CELL / 2, y: 2 * CELL + CELL / 2 };

describe('handlePointOf', () => {
  it('a token looking right (0) has its handle right of its center, past the edge', () => {
    const point = handlePointOf(kael());

    expect(point.x).toBeCloseTo(CENTER.x + CELL / 2 + HANDLE_GAP);
    expect(point.y).toBeCloseTo(CENTER.y);
  });

  it('a token looking down (90) has its handle below', () => {
    const point = handlePointOf(kael({ facing: 90 }));

    expect(point.x).toBeCloseTo(CENTER.x);
    expect(point.y).toBeCloseTo(CENTER.y + CELL / 2 + HANDLE_GAP);
  });
});

describe('handleStemOf', () => {
  it('looking right (0), the stem starts at the right edge, not at the center, and ends at the handle', () => {
    const { from, to } = handleStemOf(kael());
    expect(from.x).toBeCloseTo(CENTER.x + CELL / 2, 6);
    expect(from.y).toBeCloseTo(CENTER.y, 6);
    expect(to.x).toBeCloseTo(CENTER.x + CELL / 2 + HANDLE_GAP, 6);
  });

  it('a 2×1 token looking right starts the stem at its right edge', () => {
    const wide = kael({ width: 2, facing: 0 });
    const center = { x: 3 * CELL, y: 2.5 * CELL };
    expect(handleStemOf(wide).from.x).toBeCloseTo(center.x + CELL, 6);
    expect(handleStemOf(wide).from.y).toBeCloseTo(center.y, 6);
  });
});

describe('handleAt', () => {
  it('a press on the handle takes it, and one on the token does not', () => {
    const handle = handlePointOf(kael());

    const target = tokenFacingTarget(kael());
    expect(handleAt(target, { x: handle.x + 3, y: handle.y - 3 })).toBe(true);
    expect(handleAt(target, CENTER)).toBe(false);
  });

  it('a target is taken by its own stem end, whatever piece it is', () => {
    const stem = { from: { x: 0, y: 0 }, to: { x: 100, y: 40 } };
    expect(handleAt({ stem }, { x: 104, y: 44 })).toBe(true);
    expect(handleAt({ stem }, { x: 0, y: 0 })).toBe(false);
  });
});

describe('tokenFacingTarget', () => {
  it('the token target turns toward the pointer and keeps the token intents', () => {
    const target = tokenFacingTarget(kael());
    expect(target.facingAt({ x: 0, y: CENTER.y }, 0, false)).toBe(180);
    expect(target.previewed(180)).toEqual({
      kind: 'tokenFacingPreviewed',
      tokenId: 'kael',
      facing: 180,
    });
    expect(target.previewed(null)).toEqual({
      kind: 'tokenFacingPreviewed',
      tokenId: 'kael',
      facing: null,
    });
    expect(target.turned(180)).toEqual({ kind: 'tokenFaced', tokenId: 'kael', facing: 180 });
  });

  it('the stem of the target is the stem of the token', () => {
    expect(tokenFacingTarget(kael()).stem).toEqual(handleStemOf(kael()));
  });
});

describe('facingTargetOf', () => {
  it('the one selected token is the target, and with the ruler there is none', () => {
    expect(facingTargetOf({ tokens: [kael()], tool: 'select' })?.id).toBe('kael');
    expect(facingTargetOf({ tokens: [kael()], tool: 'ruler' })).toBeNull();
  });
});

describe('facingFromDrag', () => {
  it('dragging the handle to the left of the token turns it to 180', () => {
    expect(facingFromDrag(kael(), { x: CENTER.x - 50, y: CENTER.y }, 0, false)).toBe(180);
  });

  it('with Shift, 100° snaps to 90', () => {
    const at100 = { x: CENTER.x + Math.cos(1.745) * 50, y: CENTER.y + Math.sin(1.745) * 50 };

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
