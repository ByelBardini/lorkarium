import { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import type { RulerView } from '@/renderer/board-view';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { PixiRuler } from '@/renderer/pixi-ruler';

const GOLD = 0xc5a46d;

function centerOf(col: number, row: number) {
  return { x: (col + 0.5) * CELL_WORLD_SIZE, y: (row + 0.5) * CELL_WORLD_SIZE };
}

function drawn(ruler: RulerView | null, zoom = 1): Graphics {
  const pixiRuler = new PixiRuler();
  pixiRuler.draw(ruler, zoom);
  const [shape] = pixiRuler.container.children;
  if (!(shape instanceof Graphics)) throw new Error('expected the ruler shape first');
  return shape;
}

type Circle = Readonly<{ x: number; y: number; radius: number }>;
type Primitive = Readonly<{ type: string; x?: number; y?: number; radius?: number }>;

// The shapes of each fill or stroke, read from the context the way PixiJS keeps them.
function primitivesOf(shape: Graphics, action: 'fill' | 'stroke'): Primitive[][] {
  return shape.context.instructions
    .filter((instruction) => instruction.action === action)
    .map((instruction) => {
      const { path } = instruction.data as {
        path: { shapePath: { shapePrimitives: { shape: Primitive }[] } };
      };
      return path.shapePath.shapePrimitives.map(({ shape: primitive }) => primitive);
    });
}

function circlesOf(shape: Graphics, action: 'fill' | 'stroke'): Circle[][] {
  return primitivesOf(shape, action).map((primitives) =>
    primitives.flatMap(({ type, x = 0, y = 0, radius = 0 }) =>
      type === 'circle' ? [{ x, y, radius }] : [],
    ),
  );
}

const dragTrail: RulerView = {
  points: [centerOf(3, 4), centerOf(6, 3)],
  steps: [centerOf(3, 4), centerOf(4, 4), centerOf(5, 3), centerOf(6, 3)],
  label: '3 casas · 4,5 m',
};

type Segment = Readonly<{
  from: Readonly<{ x: number; y: number }>;
  to: Readonly<{ x: number; y: number }>;
}>;

// The line pieces of a stroke (0 the band, 1 the dashes), from the polygons PixiJS keeps.
function trailPiecesOf(shape: Graphics, stroke = 1): Segment[] {
  return primitivesOf(shape, 'stroke')[stroke]!.flatMap((primitive) => {
    const points = (primitive as { points?: number[] }).points ?? [];
    const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = points;
    return primitive.type === 'polygon' ? [{ from: { x: x1, y: y1 }, to: { x: x2, y: y2 } }] : [];
  });
}

function isOn(point: Readonly<{ x: number; y: number }>, from: Segment['from'], to: Segment['to']) {
  const cross = (to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x);
  const inside =
    Math.min(from.x, to.x) - 1e-6 <= point.x && point.x <= Math.max(from.x, to.x) + 1e-6;
  return Math.abs(cross) < 1e-6 && inside;
}

describe('PixiRuler', () => {
  it('a drag is a dashed line: many short pieces, each on a leg from cell center to cell center', () => {
    const pieces = trailPiecesOf(drawn(dragTrail));
    const legs = dragTrail.steps
      .slice(1)
      .map((to, index) => ({ from: dragTrail.steps[index]!, to }));
    const onALeg = pieces.every(({ from, to }) =>
      legs.some((leg) => isOn(from, leg.from, leg.to) && isOn(to, leg.from, leg.to)),
    );
    expect(pieces.length).toBeGreaterThan(legs.length * 3);
    expect(onALeg).toBe(true);
  });

  it('the dashes leave gaps: their length adds up to less than the trail', () => {
    const pieces = trailPiecesOf(drawn(dragTrail));
    const drawnLength = pieces.reduce(
      (sum, { from, to }) => sum + Math.hypot(to.x - from.x, to.y - from.y),
      0,
    );
    const trailLength = CELL_WORLD_SIZE * (1 + 2 * Math.SQRT2);
    expect(drawnLength).toBeLessThan(trailLength * 0.7);
    expect(drawnLength).toBeGreaterThan(trailLength * 0.4);
  });

  it('a straight run is dashed as one: no dash restarts on the cell in the middle', () => {
    const straight: RulerView = {
      ...dragTrail,
      steps: [centerOf(0, 0), centerOf(1, 0), centerOf(2, 0)],
    };
    const middle = centerOf(1, 0);
    const startsThere = trailPiecesOf(drawn(straight)).some(({ from }) => from.x === middle.x);
    expect(startsThere).toBe(false);
  });

  it('under the dashes, a faint solid gold band joins the centers, one piece per straight run', () => {
    const band = trailPiecesOf(drawn(dragTrail), 0);
    const [start, east, northeast, end] = dragTrail.steps;
    expect(band).toEqual([
      { from: start, to: east },
      { from: east, to: northeast },
      { from: northeast, to: end },
    ]);
  });

  it('the band is faint gold, the dashes and the ring on the cell the drag left are solid gold', () => {
    const shape = drawn(dragTrail);
    const strokes = shape.context.instructions.filter(({ action }) => action === 'stroke');
    const looks = strokes.map(({ data }) => {
      const { color, alpha } = (data as { style: { color: number; alpha: number } }).style;
      return { color, alpha };
    });
    expect(looks).toEqual([
      { color: GOLD, alpha: 0.3 },
      { color: GOLD, alpha: 1 },
      { color: GOLD, alpha: 1 },
    ]);
    expect(circlesOf(shape, 'stroke')[2]).toEqual([{ ...centerOf(3, 4), radius: 7 }]);
  });

  it('the dashes keep their screen size: zoomed out to half, each world dash is twice as long', () => {
    const longest = (zoom: number) =>
      Math.max(
        ...trailPiecesOf(drawn(dragTrail, zoom)).map(({ from, to }) =>
          Math.hypot(to.x - from.x, to.y - from.y),
        ),
      );
    expect(longest(0.5)).toBeCloseTo(longest(1) * 2);
  });

  it('the tool ruler stays a solid line', () => {
    const tool: RulerView = {
      points: [centerOf(0, 0), centerOf(3, 2)],
      steps: [],
      label: '3 casas',
    };
    expect(
      primitivesOf(drawn(tool), 'stroke')
        .flat()
        .map(({ type }) => type),
    ).toEqual(['polygon']);
  });

  it('no ruler draws nothing', () => {
    expect(drawn(null).context.instructions).toEqual([]);
  });
});
