import { describe, expect, it } from 'vitest';
import {
  CELL_WORLD_SIZE,
  ZOOM_LIMITS,
  clampToScene,
  fitScene,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAt,
  type Camera,
} from '@/renderer/camera';

const CAMERA: Camera = { offsetX: 100, offsetY: 50, zoom: 2 };
const SCENE_20_BY_12 = { width: 20 * CELL_WORLD_SIZE, height: 12 * CELL_WORLD_SIZE };
const VIEWPORT = { width: 1200, height: 700 };

describe('camera', () => {
  it('a cell is 64 world units and the zoom goes from 0.25 to 4', () => {
    expect(CELL_WORLD_SIZE).toBe(64);
    expect(ZOOM_LIMITS).toEqual({ min: 0.25, max: 4 });
  });

  it('worldToScreen scales by the zoom and shifts by the offset', () => {
    expect(worldToScreen(CAMERA, { x: 10, y: 20 })).toEqual({ x: 120, y: 90 });
  });

  it('screenToWorld is the inverse of worldToScreen', () => {
    const world = { x: 37.5, y: -12 };
    expect(screenToWorld(CAMERA, worldToScreen(CAMERA, world))).toEqual(world);
  });

  it('panBy moves the offset by the screen delta', () => {
    expect(panBy(CAMERA, 40, -20)).toEqual({ offsetX: 140, offsetY: 30, zoom: 2 });
  });

  it('zoomAt keeps the world point under the cursor in place', () => {
    const cursor = { x: 400, y: 300 };
    const before = screenToWorld(CAMERA, cursor);
    const zoomed = zoomAt(CAMERA, 1.5, cursor);
    expect(zoomed.zoom).toBe(3);
    expect(screenToWorld(zoomed, cursor)).toEqual(before);
  });

  it.each([
    [10, 4],
    [0.01, 0.25],
  ])('zooming by %s stops at %s', (factor, limit) => {
    expect(zoomAt(CAMERA, factor, { x: 0, y: 0 }).zoom).toBe(limit);
  });

  it('fitScene centers a 20×12 scene in a 1200×700 screen with a margin', () => {
    const fitted = fitScene(SCENE_20_BY_12, VIEWPORT);
    const topLeft = worldToScreen(fitted, { x: 0, y: 0 });
    const bottomRight = worldToScreen(fitted, {
      x: SCENE_20_BY_12.width,
      y: SCENE_20_BY_12.height,
    });
    expect(topLeft.y).toBeCloseTo(VIEWPORT.height - bottomRight.y);
    expect(topLeft.x).toBeCloseTo(VIEWPORT.width - bottomRight.x);
    expect(Math.min(topLeft.x, topLeft.y)).toBeGreaterThanOrEqual(32);
  });

  it('fitScene of a huge scene stops at the minimum zoom', () => {
    const huge = { width: 100 * CELL_WORLD_SIZE * 10, height: 100 * CELL_WORLD_SIZE * 10 };
    expect(fitScene(huge, VIEWPORT).zoom).toBe(ZOOM_LIMITS.min);
  });

  it('clampToScene keeps at least a quarter of the scene on screen', () => {
    const lost: Camera = { offsetX: -100_000, offsetY: 100_000, zoom: 1 };
    const clamped = clampToScene(lost, SCENE_20_BY_12, VIEWPORT);
    const left = worldToScreen(clamped, { x: 0, y: 0 });
    const right = worldToScreen(clamped, { x: SCENE_20_BY_12.width, y: SCENE_20_BY_12.height });
    expect(right.x).toBeCloseTo(SCENE_20_BY_12.width * 0.25);
    expect(VIEWPORT.height - left.y).toBeCloseTo(SCENE_20_BY_12.height * 0.25);
  });

  it('clampToScene leaves a camera that already shows the scene alone', () => {
    const fitted = fitScene(SCENE_20_BY_12, VIEWPORT);
    expect(clampToScene(fitted, SCENE_20_BY_12, VIEWPORT)).toEqual(fitted);
  });
});
