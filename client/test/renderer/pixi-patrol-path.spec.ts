import { cell } from '@lorkarium/game-core';
import type { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { patrolPathViewOf, type PatrolPathView } from '@/renderer/patrol-path-view';
import { PixiPatrolPath } from '@/renderer/pixi-patrol-path';

const ONE_CELL = { width: 1, height: 1 };
const SQUARE = [cell(0, 0), cell(2, 0), cell(2, 2), cell(0, 2)];

function drawn(path: PatrolPathView | null, zoom = 1): Graphics {
  const layer = new PixiPatrolPath();
  layer.draw(path, zoom);
  return layer.shape;
}

type Primitive = Readonly<{ type: string; points?: number[]; radius?: number }>;
type Look = Readonly<{ color: number; alpha: number; width?: number }>;

// The shapes and the style of each fill or stroke, read from the context as PixiJS keeps them.
function actionsOf(shape: Graphics, action: 'fill' | 'stroke') {
  return shape.context.instructions
    .filter((instruction) => instruction.action === action)
    .map((instruction) => {
      const { path, style } = instruction.data as {
        path: { shapePath: { shapePrimitives: { shape: Primitive }[] } };
        style: Look;
      };
      return { style, shapes: path.shapePath.shapePrimitives.map(({ shape: s }) => s) };
    });
}

function loop(draft: boolean): PatrolPathView {
  return patrolPathViewOf({
    path: SQUARE,
    repeat: 'loop',
    size: ONE_CELL,
    draft,
    here: cell(2, 0),
  });
}

describe('PixiPatrolPath', () => {
  it('no route draws nothing', () => {
    expect(drawn(null).context.instructions).toEqual([]);
  });

  it('the legs are one gold stroke: the 3 legs whole, and the loop back cut in dashes', () => {
    const [legs] = actionsOf(drawn(loop(true)), 'stroke');
    const pieces = legs?.shapes.filter(({ type }) => type === 'polygon') ?? [];

    expect(legs?.style.color).toBe(0xc5a46d);
    expect(pieces.length).toBeGreaterThan(3 + 5);
  });

  it('a dot marks each point of the route', () => {
    const [dots] = actionsOf(drawn(loop(true)), 'fill');

    expect(dots?.shapes.filter(({ type }) => type === 'circle')).toHaveLength(4);
  });

  it('the saved route is quieter than the draft being drawn', () => {
    const alphaOf = (path: PatrolPathView) => actionsOf(drawn(path), 'stroke')[0]?.style.alpha;

    expect(alphaOf(loop(true))).toBe(1);
    expect(alphaOf(loop(false))).toBe(0.55);
  });

  it('a ring marks where the patrol walks, the line keeping its 2 px on screen at any zoom', () => {
    const strokes = actionsOf(drawn(loop(false), 2), 'stroke');
    const ring = strokes.at(-1);

    expect(ring?.shapes.map(({ type }) => type)).toEqual(['circle']);
    expect(ring?.style.width).toBe(1);
  });
});
