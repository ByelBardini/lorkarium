import { describe, expect, it } from 'vitest';
import { PixiWallLayer } from '@/renderer/pixi-wall-layer';
import { DOOR_ICON_SCREEN_PX, type DoorIconView } from '@/renderer/wall-view';

type Polygon = Readonly<{ type: string; points?: readonly number[] }>;

// The stroked points of the door icons, read from the context the way PixiJS keeps them.
function strokedPointsOf(layer: PixiWallLayer): number[][] {
  const [shape] = layer.doors.children as unknown as [
    { context: { instructions: { action: string; data: unknown }[] } },
  ];
  return shape.context.instructions
    .filter(({ action }) => action === 'stroke')
    .flatMap(({ data }) => {
      const { path } = data as { path: { shapePath: { shapePrimitives: { shape: Polygon }[] } } };
      return path.shapePath.shapePrimitives.flatMap(({ shape }) =>
        shape.type === 'polygon' ? [[...(shape.points ?? [])]] : [],
      );
    });
}

describe('PixiWallLayer door icons', () => {
  it('keeps the padlock shackle inside the locked door icon (no line from elsewhere)', () => {
    const closed: DoorIconView = { wallId: 'w1', x: 40, y: 40, state: 'closed' };
    const locked: DoorIconView = { wallId: 'w2', x: 500, y: 900, state: 'locked' };
    const layer = new PixiWallLayer();
    layer.draw([], [closed, locked], 1);

    const half = DOOR_ICON_SCREEN_PX / 2;
    const [shackle] = strokedPointsOf(layer);
    expect(shackle).toBeDefined();
    for (let i = 0; i < (shackle ?? []).length; i += 2) {
      expect(Math.abs((shackle?.[i] ?? 0) - locked.x)).toBeLessThanOrEqual(half);
      expect(Math.abs((shackle?.[i + 1] ?? 0) - locked.y)).toBeLessThanOrEqual(half);
    }
  });
});
