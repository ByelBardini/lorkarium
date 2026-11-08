import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_DRAWING_STYLE } from '@/lib/drawing-style';
import { buildBoardView } from '@/renderer/board-view';
import type { Camera } from '@/renderer/camera';
import { PixiSceneGrid } from '@/renderer/pixi-scene-grid';
import { VHARN_SCENE } from '../support/table-session-fixtures';

const SCREEN = { width: 640, height: 640 };

function viewOfVharn() {
  return buildBoardView({
    scene: VHARN_SCENE,
    localGridVisible: true,
    ruler: null,
    tokens: [],
    selectedTokenIds: [],
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

function cameraAt(zoom: number): Camera {
  return { offsetX: 0, offsetY: 0, zoom };
}

describe('PixiSceneGrid', () => {
  it('has no band before the first draw', () => {
    expect(new PixiSceneGrid().bandWorld()).toBeNull();
  });

  it('strokes the lines as pixel lines of 1 px, whatever the zoom', () => {
    const grid = new PixiSceneGrid();
    const stroke = vi.spyOn(grid.grid, 'stroke');

    grid.drawGrid(viewOfVharn(), cameraAt(4), SCREEN);

    expect(stroke).toHaveBeenCalledWith(expect.objectContaining({ width: 1, pixelLine: true }));
  });

  it('a fresh draw shrinks the band to the view after a zoom in; a plain one keeps it', () => {
    const grid = new PixiSceneGrid();
    const view = viewOfVharn();
    grid.drawGrid(view, cameraAt(0.5), SCREEN);
    const wide = grid.bandWorld();

    grid.drawGrid(view, cameraAt(4), SCREEN);
    expect(grid.bandWorld()).toEqual(wide);

    grid.drawGrid(view, cameraAt(4), SCREEN, true);
    expect(grid.bandWorld()?.width).toBeLessThan(wide?.width ?? 0);
  });
});
