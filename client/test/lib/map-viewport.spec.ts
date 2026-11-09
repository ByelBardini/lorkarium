import { describe, expect, it } from 'vitest';
import {
  MAP_ZOOM_LIMITS,
  fitMap,
  focusMapOn,
  mapCardPosition,
  mapPinCircle,
  mapPinMarker,
  mapPointToScreen,
  mapPolygonPoints,
  panMap,
  sameMapSpot,
  screenToMapPoint,
  zoomMapAt,
} from '@/lib/map-viewport';

const IMAGE = { width: 2000, height: 1000 };
const VIEWPORT = { width: 800, height: 600 };
const CAMERA = { offsetX: 100, offsetY: 50, zoom: 0.5 };

describe('map viewport', () => {
  it('turns a point of the map into the screen and back', () => {
    const point = { x: 0.25, y: 0.75 };
    const screen = mapPointToScreen(CAMERA, IMAGE, point);
    expect(screen).toEqual({ x: 350, y: 425 });
    expect(screenToMapPoint(CAMERA, IMAGE, screen)).toEqual(point);
  });

  it('a screen position off the image reads past 0 to 1', () => {
    expect(screenToMapPoint(CAMERA, IMAGE, { x: 0, y: 0 }).x).toBeLessThan(0);
  });

  it('frames a map of 8192 px inside a small window, centered', () => {
    const camera = fitMap({ width: 8192, height: 8192 }, VIEWPORT);
    const side = 8192 * camera.zoom;
    expect(side).toBeLessThanOrEqual(VIEWPORT.height);
    expect(camera.offsetX).toBeCloseTo((VIEWPORT.width - side) / 2);
    expect(camera.offsetY).toBeCloseTo((VIEWPORT.height - side) / 2);
  });

  it('zooms below the board floor and keeps the point under the cursor', () => {
    const anchor = { x: 300, y: 200 };
    const under = screenToMapPoint(CAMERA, IMAGE, anchor);
    const camera = zoomMapAt(CAMERA, 0.5, anchor, IMAGE, VIEWPORT);
    expect(camera.zoom).toBe(0.25);
    expect(screenToMapPoint(camera, IMAGE, anchor).x).toBeCloseTo(under.x);
    expect(screenToMapPoint(camera, IMAGE, anchor).y).toBeCloseTo(under.y);
  });

  it('the zoom stops at the limits of a map', () => {
    const anchor = { x: 0, y: 0 };
    expect(zoomMapAt(CAMERA, 1000, anchor, IMAGE, VIEWPORT).zoom).toBe(MAP_ZOOM_LIMITS.max);
    expect(zoomMapAt(CAMERA, 0.001, anchor, IMAGE, VIEWPORT).zoom).toBe(MAP_ZOOM_LIMITS.min);
  });

  it('a pan never takes the map off the screen', () => {
    const away = panMap(CAMERA, { dx: 100_000, dy: 100_000 }, IMAGE, VIEWPORT);
    expect(away.offsetX).toBeLessThan(VIEWPORT.width);
    expect(away.offsetY).toBeLessThan(VIEWPORT.height);
  });

  it('a pan inside the bounds moves by what was dragged', () => {
    expect(panMap(CAMERA, { dx: 10, dy: -20 }, IMAGE, VIEWPORT)).toEqual({
      ...CAMERA,
      offsetX: 110,
      offsetY: 30,
    });
  });

  it('a pin sits on its point, its radius undone by the zoom', () => {
    const near = mapPinCircle({ x: 0.5, y: 0.25 }, IMAGE, 2);
    const far = mapPinCircle({ x: 0.5, y: 0.25 }, IMAGE, 0.5);
    expect(near).toMatchObject({ cx: 1000, cy: 250 });
    expect(far.r).toBe(near.r * 4);
  });

  it('writes a polygon in the pixels of the image', () => {
    const points = [
      { x: 0.5, y: 1 },
      { x: 0, y: 0.5 },
    ];
    expect(mapPolygonPoints(points, IMAGE)).toBe('1000,1000 0,500');
  });

  describe('mapPinMarker', () => {
    it('is 30 px across on screen, whatever the zoom', () => {
      expect(mapPinMarker({ x: 0.5, y: 0.25 }, IMAGE, 2).r * 2).toBe(15);
      expect(mapPinMarker({ x: 0.5, y: 0.25 }, IMAGE, 0.5).r * 0.5).toBe(15);
    });

    it('sits on the point, in the pixels of the image', () => {
      expect(mapPinMarker({ x: 0.5, y: 0.25 }, IMAGE, 1)).toMatchObject({ cx: 1000, cy: 250 });
    });

    it('the click area reaches past the disc and the icon fits inside it', () => {
      const { r, hitRadius, iconSize } = mapPinMarker({ x: 0.5, y: 0.25 }, IMAGE, 1);
      expect(hitRadius).toBeGreaterThan(r);
      expect(iconSize).toBeLessThan(r * 2);
    });
  });

  describe('mapCardPosition', () => {
    const CARD = { width: 320, height: 160 };
    const FRAME = { width: 1000, height: 600 };

    it('sits to the right of the spot, centered on it', () => {
      expect(mapCardPosition({ x: 300, y: 200 }, CARD, FRAME)).toEqual({ x: 316, y: 120 });
    });

    it('goes to the left when the right has no room', () => {
      expect(mapCardPosition({ x: 900, y: 200 }, CARD, FRAME)).toEqual({ x: 564, y: 120 });
    });

    it('never leaves the top of the frame', () => {
      expect(mapCardPosition({ x: 300, y: 10 }, CARD, FRAME).y).toBe(12);
    });

    it('never leaves the bottom of the frame', () => {
      expect(mapCardPosition({ x: 300, y: 595 }, CARD, FRAME).y).toBe(428);
    });

    it('with the spot dragged off to the left, stays at the edge', () => {
      expect(mapCardPosition({ x: -500, y: 200 }, CARD, FRAME).x).toBe(12);
    });

    it('with the spot dragged off to the right, stays at the edge', () => {
      expect(mapCardPosition({ x: 1800, y: 200 }, CARD, FRAME).x).toBe(668);
    });

    it('with no room on either side, stays inside the frame', () => {
      const narrow = { width: 360, height: 600 };
      expect(mapCardPosition({ x: 180, y: 200 }, CARD, narrow).x).toBe(28);
    });

    it('a card bigger than the frame starts at the margin', () => {
      const tiny = { width: 200, height: 100 };
      expect(mapCardPosition({ x: 100, y: 50 }, CARD, tiny)).toEqual({ x: 12, y: 12 });
    });
  });

  describe('sameMapSpot', () => {
    const POINT = { x: 0.5, y: 0.5 };

    it('points a few screen pixels apart are the same spot', () => {
      // 4 screen px at zoom 0.5 are 8 image px: 0.004 of a width of 2000.
      expect(sameMapSpot(CAMERA, IMAGE, POINT, { x: 0.504, y: 0.5 })).toBe(true);
    });

    it('the same distance on the map is another spot when zoomed in', () => {
      const close = { offsetX: 0, offsetY: 0, zoom: 8 };
      expect(sameMapSpot(close, IMAGE, POINT, { x: 0.504, y: 0.5 })).toBe(false);
    });

    it('points far apart on the screen are not', () => {
      expect(sameMapSpot(CAMERA, IMAGE, POINT, { x: 0.6, y: 0.5 })).toBe(false);
    });

    it('the image is measured in pixels, not in shares of each side', () => {
      // 0.016 of a height of 1000 is 16 image px, 8 on the screen; of the width it would be 16.
      expect(sameMapSpot(CAMERA, IMAGE, POINT, { x: 0.5, y: 0.516 })).toBe(true);
    });
  });

  describe('focusMapOn', () => {
    const POINT = { x: 0.5, y: 0.5 };
    const close = { offsetX: 0, offsetY: 0, zoom: 3 };

    it('puts the point in the middle of the window', () => {
      const screen = mapPointToScreen(focusMapOn(close, POINT, IMAGE, VIEWPORT), IMAGE, POINT);
      expect(screen).toEqual({ x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 });
    });

    it('a view already close keeps its zoom', () => {
      expect(focusMapOn(close, POINT, IMAGE, VIEWPORT).zoom).toBe(close.zoom);
    });

    it('a map seen whole comes closer, or centering would move nothing', () => {
      const framed = fitMap(IMAGE, VIEWPORT);
      expect(focusMapOn(framed, POINT, IMAGE, VIEWPORT).zoom).toBeGreaterThan(framed.zoom);
    });

    it('never comes closer than the limit of the map', () => {
      const tiny = { width: 10, height: 10 };
      const framed = fitMap(tiny, VIEWPORT);
      expect(focusMapOn(framed, POINT, tiny, VIEWPORT).zoom).toBe(MAP_ZOOM_LIMITS.max);
    });

    it('a point at the corner stays within what the map may show', () => {
      const focused = focusMapOn(close, { x: 0, y: 0 }, IMAGE, VIEWPORT);
      expect(focused.offsetX).toBeLessThan(VIEWPORT.width);
      expect(focused.offsetY).toBeLessThan(VIEWPORT.height);
    });
  });
});
