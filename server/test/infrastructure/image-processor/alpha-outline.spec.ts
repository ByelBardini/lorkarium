import { describe, expect, it } from 'vitest';
import {
  outlineOfAlpha,
  type AlphaGrid,
  type TracedOutline,
} from '../../../src/infrastructure/image-processor/alpha-outline';

type AlphaAt = (x: number, y: number) => number;
type Box = Readonly<{ left: number; top: number; size: number }>;

function gridOf(width: number, height: number, alphaAt: AlphaAt): AlphaGrid {
  const alpha = new Uint8Array(width * height);
  for (let at = 0; at < alpha.length; at += 1) {
    alpha[at] = alphaAt(at % width, Math.floor(at / width));
  }
  return { width, height, alpha };
}

function inBox(box: Box, x: number, y: number): boolean {
  const insideX = x >= box.left && x < box.left + box.size;
  return insideX && y >= box.top && y < box.top + box.size;
}

function blobs(boxes: readonly Box[]): AlphaAt {
  return (x, y) => (boxes.some((box) => inBox(box, x, y)) ? 255 : 0);
}

function polygonArea(polygon: TracedOutline[number]): number {
  const doubled = polygon.reduce((sum, [x, y], at) => {
    const [nextX, nextY] = polygon[(at + 1) % polygon.length] ?? [x, y];
    return sum + x * nextY - nextX * y;
  }, 0);
  return Math.abs(doubled) / 2;
}

function vertexCount(outline: TracedOutline): number {
  return outline.reduce((sum, polygon) => sum + polygon.length, 0);
}

function sorted(polygon: TracedOutline[number] | undefined): number[][] {
  const points = (polygon ?? []).map(([x, y]) => [x, y]);
  return points.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0) || (a[1] ?? 0) - (b[1] ?? 0));
}

function areasOf(outline: TracedOutline): number[] {
  const areas = outline.map((polygon) => Math.round(polygonArea(polygon) * 10_000) / 10_000);
  return areas.sort((a, b) => a - b);
}

describe('outlineOfAlpha', () => {
  it('an opaque square in the middle of a 100×100 grid is one polygon with its 4 corners', () => {
    const grid = gridOf(100, 100, blobs([{ left: 25, top: 25, size: 50 }]));

    const outline = outlineOfAlpha(grid);

    expect(outline).toHaveLength(1);
    expect(sorted(outline[0])).toEqual([
      [0.25, 0.25],
      [0.25, 0.75],
      [0.75, 0.25],
      [0.75, 0.75],
    ]);
  });

  it('a fully opaque square grid is the whole unit square', () => {
    expect(sorted(outlineOfAlpha(gridOf(8, 8, () => 255))[0])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
  });

  it('an opaque grid twice as wide as tall sits contained in the unit square, y from 0.25 to 0.75', () => {
    expect(sorted(outlineOfAlpha(gridOf(100, 50, () => 255))[0])).toEqual([
      [0, 0.25],
      [0, 0.75],
      [1, 0.25],
      [1, 0.75],
    ]);
  });

  it('an opaque grid twice as tall as wide sits contained, x from 0.25 to 0.75', () => {
    expect(sorted(outlineOfAlpha(gridOf(50, 100, () => 255))[0])).toEqual([
      [0.25, 0],
      [0.25, 1],
      [0.75, 0],
      [0.75, 1],
    ]);
  });

  it('an L shape keeps its 6 corners, the notch included', () => {
    const grid = gridOf(10, 10, (x, y) => (x < 5 || y >= 5 ? 255 : 0));

    expect(sorted(outlineOfAlpha(grid)[0])).toEqual([
      [0, 0],
      [0, 1],
      [0.5, 0],
      [0.5, 0.5],
      [1, 0.5],
      [1, 1],
    ]);
  });

  it('a circle fits in 48 vertices with its area within 5% of the real one', () => {
    const inCircle: AlphaAt = (x, y) => (Math.hypot(x + 0.5 - 64, y + 0.5 - 64) <= 60 ? 255 : 0);

    const outline = outlineOfAlpha(gridOf(128, 128, inCircle));

    const realArea = Math.PI * (60 / 128) ** 2;
    expect(outline).toHaveLength(1);
    expect(vertexCount(outline)).toBeLessThanOrEqual(48);
    expect(Math.abs(polygonArea(outline[0] ?? []) - realArea) / realArea).toBeLessThan(0.05);
  });

  it('a jagged shape with thousands of corners is reduced to at most 48 vertices', () => {
    const comb: AlphaAt = (x, y) => (y < 8 || x % 2 === 0 ? 255 : 0);

    const outline = outlineOfAlpha(gridOf(128, 128, comb));

    expect(outline).toHaveLength(1);
    expect(vertexCount(outline)).toBeLessThanOrEqual(48);
    expect(outline[0]?.length).toBeGreaterThanOrEqual(3);
  });

  it('a thin island keeps at least a triangle when a jagged neighbour squeezes the budget', () => {
    const shapes: AlphaAt = (x, y) => {
      const stripe = y >= 110 && y < 112 && x >= 10 && x < 110;
      return stripe || (y < 100 && (y < 4 || x % 2 === 0)) ? 255 : 0;
    };

    const outline = outlineOfAlpha(gridOf(128, 128, shapes));

    expect(outline).toHaveLength(2);
    expect(vertexCount(outline)).toBeLessThanOrEqual(48);
    expect(outline.map((polygon) => polygon.length >= 3)).toEqual([true, true]);
  });

  it('a notch of a single cell survives the reduction', () => {
    const grid = gridOf(10, 10, (x, y) => (x === 5 && y === 0 ? 0 : 255));

    expect(outlineOfAlpha(grid)[0]).toContainEqual([0.5, 0.1]);
  });

  it('alpha 128 counts as solid', () => {
    expect(outlineOfAlpha(gridOf(4, 4, () => 128))).toHaveLength(1);
  });

  it('alpha 127 counts as empty, so the grid has no outline', () => {
    expect(outlineOfAlpha(gridOf(4, 4, () => 127))).toEqual([]);
  });

  it('a fully transparent grid gives an empty list', () => {
    expect(outlineOfAlpha(gridOf(16, 16, () => 0))).toEqual([]);
  });

  it('two blobs give two polygons', () => {
    const grid = gridOf(
      100,
      100,
      blobs([
        { left: 10, top: 10, size: 20 },
        { left: 60, top: 60, size: 30 },
      ]),
    );

    expect(areasOf(outlineOfAlpha(grid))).toEqual([0.04, 0.09]);
  });

  it('a blob of 0.49% of the area falls and one of exactly 1% stays', () => {
    const grid = gridOf(
      100,
      100,
      blobs([
        { left: 0, top: 0, size: 7 },
        { left: 50, top: 50, size: 10 },
      ]),
    );

    expect(areasOf(outlineOfAlpha(grid))).toEqual([0.01]);
  });

  it('out of 6 blobs only the 4 largest stay', () => {
    const sizes = [10, 11, 12, 13, 14, 15];
    const boxes = sizes.map((size, at) => ({ left: at * 16, top: 0, size }));

    expect(areasOf(outlineOfAlpha(gridOf(100, 100, blobs(boxes))))).toEqual([
      0.0144, 0.0169, 0.0196, 0.0225,
    ]);
  });

  it('a ring is traced by its outer contour alone', () => {
    const ring: AlphaAt = (x, y) => {
      const inner = inBox({ left: 30, top: 30, size: 40 }, x, y);
      return inBox({ left: 20, top: 20, size: 60 }, x, y) && !inner ? 255 : 0;
    };

    expect(areasOf(outlineOfAlpha(gridOf(100, 100, ring)))).toEqual([0.36]);
  });

  it('a blob inside the hole of a ring adds no second polygon', () => {
    const island: Box = { left: 45, top: 45, size: 12 };
    const ring: AlphaAt = (x, y) => {
      const inner = inBox({ left: 30, top: 30, size: 40 }, x, y);
      const band = inBox({ left: 20, top: 20, size: 60 }, x, y) && !inner;
      return band || inBox(island, x, y) ? 255 : 0;
    };

    expect(outlineOfAlpha(gridOf(100, 100, ring))).toHaveLength(1);
  });

  it('two solid blocks touching only by a corner are one polygon', () => {
    const grid = gridOf(20, 20, (x, y) => (x < 10 === y < 10 ? 255 : 0));

    expect(areasOf(outlineOfAlpha(grid))).toEqual([0.5]);
  });

  it('a grid whose alpha does not match its size is refused citing both', () => {
    const grid = { width: 4, height: 4, alpha: new Uint8Array(15) };

    expect(() => outlineOfAlpha(grid)).toThrow(RangeError);
    expect(() => outlineOfAlpha(grid)).toThrow(/15 .*4×4.*expected 16/);
  });
});
