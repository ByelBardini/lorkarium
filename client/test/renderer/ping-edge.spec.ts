import { describe, expect, it } from 'vitest';
import { pingEdgeOf } from '@/renderer/ping-edge';

const SCREEN = { width: 800, height: 600 };
const MARGIN = 24;

describe('pingEdgeOf', () => {
  it('a ping on screen has no arrow', () => {
    expect(pingEdgeOf({ x: 400, y: 300 }, SCREEN, MARGIN)).toBeNull();
  });

  it('a ping on the screen border still has no arrow', () => {
    expect(pingEdgeOf({ x: 800, y: 0 }, SCREEN, MARGIN)).toBeNull();
  });

  it('a ping off to the right puts the arrow on the right edge, pointing at angle 0', () => {
    expect(pingEdgeOf({ x: 1300, y: 300 }, SCREEN, MARGIN)).toEqual({ x: 776, y: 300, angle: 0 });
  });

  it('a ping above and to the left pins the arrow in that corner, pointing at it', () => {
    expect(pingEdgeOf({ x: -76, y: -76 }, SCREEN, MARGIN)).toEqual({
      x: 24,
      y: 24,
      angle: (-3 * Math.PI) / 4,
    });
  });

  it('a ping below points down', () => {
    expect(pingEdgeOf({ x: 100, y: 900 }, SCREEN, MARGIN)).toEqual({
      x: 100,
      y: 576,
      angle: Math.PI / 2,
    });
  });
});
