import { describe, expect, it, vi } from 'vitest';
import { PixiSightBlockerLayer } from '@/renderer/pixi-sight-blocker-layer';
import type { SightBlockerOutlineView } from '@/renderer/sight-blocker-outline-view';

const OUTLINE: SightBlockerOutlineView = {
  polygons: [
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ],
  ],
};

function drawn() {
  const layer = new PixiSightBlockerLayer();
  layer.draw(OUTLINE, 1);
  return { layer, clear: vi.spyOn(layer.shape, 'clear') };
}

describe('PixiSightBlockerLayer', () => {
  it('draws the outline where the view says', () => {
    const { layer } = drawn();

    expect(layer.shape.bounds.width).toBeGreaterThanOrEqual(100);
    expect(layer.shape.bounds.height).toBeGreaterThanOrEqual(90);
  });

  it('the same view at the same zoom, the camera having only panned, is not redrawn', () => {
    const { layer, clear } = drawn();

    layer.draw(OUTLINE, 1);

    expect(clear).not.toHaveBeenCalled();
  });

  it('a new zoom is redrawn: the dashes and the line keep their size on screen', () => {
    const { layer, clear } = drawn();

    layer.draw(OUTLINE, 2);

    expect(clear).toHaveBeenCalledOnce();
  });

  it('a new view is redrawn', () => {
    const { layer, clear } = drawn();

    layer.draw({ polygons: [...OUTLINE.polygons] }, 1);

    expect(clear).toHaveBeenCalledOnce();
  });

  it('with no view it wipes the line, and then a zoom costs nothing', () => {
    const { layer, clear } = drawn();

    layer.draw(null, 1);
    layer.draw(null, 3);

    expect(clear).toHaveBeenCalledOnce();
    expect(layer.shape.bounds.width).toBe(0);
  });
});
