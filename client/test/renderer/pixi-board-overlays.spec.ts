import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_DRAWING_STYLE } from '@/lib/drawing-style';
import { buildBoardView } from '@/renderer/board-view';
import { PixiBoardOverlays } from '@/renderer/pixi-board-overlays';
import type { DoorIconView, WallView } from '@/renderer/wall-view';
import type { LightView } from '@/renderer/light-view';
import { LYRA_ID, VHARN_SCENE, lyra } from '../support/table-session-fixtures';

// The band the camera shows (plus margin), in world px.
const BAND = { x: 0, y: 0, width: 640, height: 640 };

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

    overlays.draw(masterViewOf([LYRA_ID]), 1, BAND);
    expect(overlays.sightBlocker.shape.bounds.width).toBeGreaterThan(0);

    overlays.draw(masterViewOf([]), 1, BAND);
    expect(overlays.sightBlocker.shape.bounds.width).toBe(0);
  });
});

describe('PixiBoardOverlays, cut to the band', () => {
  const wallOf = (id: string, x: number): WallView => ({
    id,
    kind: 'wall',
    doorState: null,
    segments: [{ from: { x, y: 100 }, to: { x: x + 200, y: 100 } }],
    emphasis: 'full',
    selected: false,
  });
  const NEAR_WALL = wallOf('near', 100);
  const FAR_WALL = wallOf('far', 2000);
  const FAR_DOOR: DoorIconView = { wallId: 'far', x: 2100, y: 100, state: 'closed' };
  const lightOf = (id: string, x: number): LightView => ({
    id,
    x,
    y: 300,
    lit: false,
    color: null,
    facing: 0,
    angle: 360,
    emphasis: 'full',
    selected: false,
    areas: null,
  });
  const NEAR_LIGHT = lightOf('near', 300);
  const FAR_LIGHT = lightOf('far', 3000);

  function viewWithFarThings() {
    return {
      ...masterViewOf([]),
      walls: [NEAR_WALL, FAR_WALL],
      doors: [FAR_DOOR],
      lights: [NEAR_LIGHT, FAR_LIGHT],
    };
  }

  it('draws only the walls, doors and lights in the band, and the view keeps them all', () => {
    const overlays = new PixiBoardOverlays(() => undefined);
    const drawWalls = vi.spyOn(overlays.walls, 'draw');
    const drawLights = vi.spyOn(overlays.lights, 'draw');
    const view = viewWithFarThings();

    overlays.draw(view, 1, BAND);

    expect(drawWalls).toHaveBeenCalledWith([NEAR_WALL], [], 1);
    expect(drawLights).toHaveBeenCalledWith([NEAR_LIGHT], 1);
    expect(view.walls).toEqual([NEAR_WALL, FAR_WALL]);
    expect(view.doors).toEqual([FAR_DOOR]);
  });
});
