import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAWING_STYLE } from '@/lib/drawing-style';
import { buildBoardView } from '@/renderer/board-view';
import { PixiBoardOverlays } from '@/renderer/pixi-board-overlays';
import { LYRA_ID, VHARN_SCENE, lyra } from '../support/table-session-fixtures';

function masterViewOf(selectedTokenIds: readonly string[]) {
  return buildBoardView({
    scene: VHARN_SCENE,
    localGridVisible: true,
    ruler: null,
    tokens: [lyra({ col: 3, row: 3, blocksSight: true })],
    selectedTokenIds,
    activeLayer: 'tokens',
    canChooseLayer: true,
    preview: [],
    facingPreview: {},
    resizePreview: {},
    drag: null,
    dragged: {},
    readOnly: false,
    tool: 'select',
    currentTokenIds: [],
    drawings: [],
    viewer: { userId: 'ana', isMaster: true },
    selectedDrawingIds: [],
    drawingPreview: [],
    drawingStyle: DEFAULT_DRAWING_STYLE,
  });
}

describe('PixiBoardOverlays, the line of the blocker', () => {
  it('sits right above the outline of the field of view, under the wall lines', () => {
    const overlays = new PixiBoardOverlays(() => undefined);

    const layers = overlays.containers([]);

    expect(layers.indexOf(overlays.sightBlocker.shape)).toBe(
      layers.indexOf(overlays.sightCone.shape) + 1,
    );
    expect(layers.indexOf(overlays.sightBlocker.shape)).toBeLessThan(
      layers.indexOf(overlays.walls.lines),
    );
  });

  it('draws the line of the view, and wipes it once nothing is selected', () => {
    const overlays = new PixiBoardOverlays(() => undefined);

    overlays.draw(masterViewOf([LYRA_ID]), 1);
    expect(overlays.sightBlocker.shape.bounds.width).toBeGreaterThan(0);

    overlays.draw(masterViewOf([]), 1);
    expect(overlays.sightBlocker.shape.bounds.width).toBe(0);
  });
});
