import type { MapRegionDto } from '@lorkarium/contracts';
import {
  MAP_POLYGON_VERTICES_MAX,
  type MapPoint,
  type MapRegionGeometry,
} from '@lorkarium/game-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { DRAWING_COLORS } from '@/lib/drawing-style';
import {
  MAP_REGION_DEFAULT_COLOR,
  MAP_REGION_DEFAULT_NAME,
  createMapDrawingFlow,
  type SameMapSpot,
} from '@/stores/map-drawing-flow';
import { VHARN } from '../support/campaigns-api-fake';
import { LibraryMapsApiFake } from '../support/library-maps-api-fake';
import { CAPITAL_REGION_ID, MUNDO_ID, mapRegion, pinRegion } from '../support/library-map-fixtures';

const A: MapPoint = { x: 0.1, y: 0.1 };
const B: MapPoint = { x: 0.5, y: 0.1 };
const C: MapPoint = { x: 0.5, y: 0.5 };
const D: MapPoint = { x: 0.1, y: 0.5 };
const FULL = { ok: false, failure: { kind: 'regions_full' } } as const;
const OFFLINE = { ok: false, failure: { kind: 'offline' } } as const;
const SAME_SPOT: SameMapSpot = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 0.01;

function pointOnCircle(index: number): MapPoint {
  const angle = (index / MAP_POLYGON_VERTICES_MAX) * 2 * Math.PI;
  return { x: 0.5 + 0.4 * Math.cos(angle), y: 0.5 + 0.4 * Math.sin(angle) };
}

describe('map drawing flow', () => {
  let api: LibraryMapsApiFake;
  let created: MapRegionDto[];
  let moved: MapRegionDto[];

  beforeEach(() => {
    api = new LibraryMapsApiFake();
    created = [];
    moved = [];
    api.answer('createRegion', { ok: true, value: mapRegion() });
    api.answer('updateRegion', { ok: true, value: mapRegion() });
  });

  function flow() {
    return createMapDrawingFlow({
      api,
      campaignId: VHARN.id,
      mapId: MUNDO_ID,
      onRegionCreated: (region) => created.push(region),
      onRegionMoved: (region) => moved.push(region),
    });
  }

  function drawing(...points: readonly MapPoint[]) {
    const store = flow();
    store.getState().chooseTool('polygon');
    points.forEach((point) => store.getState().clickMap(point, SAME_SPOT));
    return store;
  }

  function creations() {
    return api.calls.filter(({ method }) => method === 'createRegion');
  }

  function updates() {
    return api.calls.filter(({ method }) => method === 'updateRegion');
  }

  function sentGeometry(): unknown {
    const input = creations()[0]?.args[2] as { geometry: MapRegionGeometry } | undefined;
    return input?.geometry;
  }

  async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  describe('drawing a polygon', () => {
    it('each click adds a vertex, in order', () => {
      expect(drawing(A, B).getState().vertices).toEqual([A, B]);
    });

    it('a click on the first vertex closes it with one POST', async () => {
      const store = drawing(A, B, C);
      store.getState().clickMap({ x: A.x + 0.001, y: A.y }, SAME_SPOT);
      await settle();
      expect(creations()).toEqual([
        {
          method: 'createRegion',
          args: [
            VHARN.id,
            MUNDO_ID,
            {
              name: MAP_REGION_DEFAULT_NAME,
              color: MAP_REGION_DEFAULT_COLOR,
              geometry: { shape: 'polygon', points: [A, B, C] },
            },
          ],
        },
      ]);
    });

    it('Enter closes it', async () => {
      drawing(A, B, C, D).getState().finishPolygon();
      await settle();
      expect(sentGeometry()).toEqual({ shape: 'polygon', points: [A, B, C, D] });
    });

    it('the answer is handed over and the tool is put away', async () => {
      const store = drawing(A, B, C);
      store.getState().finishPolygon();
      await settle();
      expect(created).toEqual([mapRegion()]);
      expect(store.getState()).toMatchObject({ tool: null, vertices: [], saving: false });
    });

    it('the default color is one of the palette, so the form marks its swatch', () => {
      expect(DRAWING_COLORS.map(({ hex }) => hex)).toContain(MAP_REGION_DEFAULT_COLOR);
    });
  });

  describe('dropping a pin', () => {
    it('one click sends the pin', async () => {
      const store = flow();
      store.getState().chooseTool('pin');
      store.getState().clickMap(C, SAME_SPOT);
      await settle();
      expect(sentGeometry()).toEqual({ shape: 'pin', point: C });
    });

    it('Enter does nothing to a pin', async () => {
      const store = flow();
      store.getState().chooseTool('pin');
      store.getState().finishPolygon();
      await settle();
      expect(creations()).toEqual([]);
    });
  });

  describe('the edges of a drawing', () => {
    it('with no tool, a click does nothing', async () => {
      const store = flow();
      store.getState().clickMap(A, SAME_SPOT);
      await settle();
      expect(store.getState().vertices).toEqual([]);
      expect(creations()).toEqual([]);
    });

    it('the second click of a double click adds no vertex', () => {
      expect(drawing(A, B, { x: B.x + 0.001, y: B.y }).getState().vertices).toEqual([A, B]);
    });

    it('the first vertex does not close a polygon of less than 3', async () => {
      const store = drawing(A, B, A);
      await settle();
      expect(store.getState().vertices).toEqual([A, B]);
      expect(store.getState().failure).toBeNull();
      expect(creations()).toEqual([]);
    });

    it('Esc undoes the last vertex, one at a time, and then cancels', () => {
      const store = drawing(A, B);
      store.getState().stepBack();
      expect(store.getState().vertices).toEqual([A]);
      store.getState().stepBack();
      expect(store.getState()).toMatchObject({ tool: 'polygon', vertices: [] });
      store.getState().stepBack();
      expect(store.getState().tool).toBeNull();
    });

    it('Esc cancels a pin', () => {
      const store = flow();
      store.getState().chooseTool('pin');
      store.getState().stepBack();
      expect(store.getState().tool).toBeNull();
    });

    it.each([
      [{ x: 1.01, y: 0.5 }],
      [{ x: -0.01, y: 0.5 }],
      [{ x: 0.5, y: 1.01 }],
      [{ x: 0.5, y: -0.01 }],
    ])('a click outside the image at %j is ignored', (outside) => {
      expect(drawing(A, outside).getState().vertices).toEqual([A]);
    });

    it('a click exactly on the edge of the image counts', () => {
      const corner = { x: 1, y: 0 };
      expect(drawing(corner).getState().vertices).toEqual([corner]);
    });

    it('a pin outside the image is not sent', async () => {
      const store = flow();
      store.getState().chooseTool('pin');
      store.getState().clickMap({ x: 2, y: 0.5 }, SAME_SPOT);
      await settle();
      expect(creations()).toEqual([]);
      expect(store.getState().tool).toBe('pin');
    });

    it('the 128th vertex closes the polygon: there is no room for another', async () => {
      const points = Array.from({ length: MAP_POLYGON_VERTICES_MAX }, (_, at) => pointOnCircle(at));
      drawing(...points);
      await settle();
      expect(creations()).toHaveLength(1);
      expect(sentGeometry()).toEqual({ shape: 'polygon', points });
    });

    it('the 127th vertex does not', async () => {
      const points = Array.from({ length: MAP_POLYGON_VERTICES_MAX - 1 }, (_, at) =>
        pointOnCircle(at),
      );
      drawing(...points);
      await settle();
      expect(creations()).toEqual([]);
    });

    it('choosing a tool starts a new drawing', () => {
      const store = drawing(A, B);
      store.getState().chooseTool('pin');
      expect(store.getState()).toMatchObject({ tool: 'pin', vertices: [] });
    });

    it('stopping throws the drawing away', () => {
      const store = drawing(A, B);
      store.getState().stopDrawing();
      expect(store.getState()).toMatchObject({ tool: null, vertices: [] });
    });

    it('no tool can be taken up while a drawing is on its way', () => {
      api.heldRegionCreations = [];
      const store = drawing(A, B, C);
      store.getState().finishPolygon();
      store.getState().chooseTool('pin');
      expect(store.getState().tool).toBe('polygon');
    });

    it('a second close while the first is on its way sends nothing more', async () => {
      api.heldRegionCreations = [];
      const store = drawing(A, B, C);
      store.getState().finishPolygon();
      store.getState().finishPolygon();
      store.getState().clickMap(D, SAME_SPOT);
      store.getState().stepBack();
      expect(store.getState()).toMatchObject({ saving: true, vertices: [A, B, C] });
      await settle();
      expect(creations()).toHaveLength(1);
    });
  });

  describe('a polygon that cannot be sent', () => {
    it('three points on one line do not send, by the rule of the game-core', async () => {
      const store = drawing({ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 });
      store.getState().finishPolygon();
      await settle();
      expect(creations()).toEqual([]);
      expect(store.getState().failure).toBe('no_area');
    });

    it('the drawing stays, to be fixed', () => {
      const line = [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
        { x: 0.3, y: 0.3 },
      ];
      const store = drawing(...line);
      store.getState().finishPolygon();
      expect(store.getState()).toMatchObject({ tool: 'polygon', vertices: line });
    });

    it('two points do not send', async () => {
      const store = drawing(A, B);
      store.getState().finishPolygon();
      await settle();
      expect(creations()).toEqual([]);
      expect(store.getState().failure).toBe('no_area');
    });

    it('the next vertex takes the complaint away', () => {
      const store = drawing(A, B);
      store.getState().finishPolygon();
      store.getState().clickMap(C, SAME_SPOT);
      expect(store.getState().failure).toBeNull();
    });
  });

  describe('a refused POST', () => {
    it('says why, and keeps the drawing for another try', async () => {
      api.answer('createRegion', FULL);
      const store = drawing(A, B, C);
      store.getState().finishPolygon();
      await settle();
      expect(store.getState()).toMatchObject({
        failure: 'regions_full',
        saving: false,
        tool: 'polygon',
        vertices: [A, B, C],
      });
      expect(created).toEqual([]);
    });
  });

  describe('moving a handle', () => {
    const CAPITAL = mapRegion();
    const CAPITAL_POINTS =
      CAPITAL.geometry.shape === 'polygon' ? CAPITAL.geometry.points : ([] as MapPoint[]);
    const NEW_FIRST = { x: 0.05, y: 0.02 };
    const MOVED = {
      shape: 'polygon',
      points: [NEW_FIRST, CAPITAL_POINTS[1], CAPITAL_POINTS[2]],
    };

    function grabbed() {
      const store = flow();
      store.getState().grabHandle(CAPITAL, 0);
      return store;
    }

    it('the shape follows the hand and nothing is sent yet', () => {
      const store = grabbed();
      store.getState().dragHandle(NEW_FIRST);
      expect(store.getState().moved).toEqual({ regionId: CAPITAL_REGION_ID, geometry: MOVED });
      expect(updates()).toEqual([]);
    });

    it('letting go sends one PATCH with the shape', async () => {
      const store = grabbed();
      store.getState().dragHandle({ x: 0.3, y: 0.3 });
      store.getState().dragHandle(NEW_FIRST);
      store.getState().releaseHandle();
      await settle();
      expect(updates()).toEqual([
        {
          method: 'updateRegion',
          args: [VHARN.id, MUNDO_ID, CAPITAL_REGION_ID, { geometry: MOVED }],
        },
      ]);
    });

    it('until the answer the shape stays where it was let go', async () => {
      api.heldRegionUpdates = [];
      const store = grabbed();
      store.getState().dragHandle(NEW_FIRST);
      store.getState().releaseHandle();
      await settle();
      expect(store.getState()).toMatchObject({ grabbed: false, saving: true });
      expect(store.getState().moved?.geometry).toEqual(MOVED);
    });

    it('the confirmed region is handed over and the shape is no longer ahead', async () => {
      const store = grabbed();
      store.getState().dragHandle(NEW_FIRST);
      store.getState().releaseHandle();
      await settle();
      expect(moved).toEqual([mapRegion()]);
      expect(store.getState()).toMatchObject({ moved: null, saving: false, failure: null });
    });

    it('a refusal goes back to the confirmed shape and says why', async () => {
      api.answer('updateRegion', OFFLINE);
      const store = grabbed();
      store.getState().dragHandle(NEW_FIRST);
      store.getState().releaseHandle();
      await settle();
      expect(store.getState()).toMatchObject({ moved: null, saving: false, failure: 'offline' });
      expect(moved).toEqual([]);
    });

    it('letting go where it was sends nothing', async () => {
      const store = grabbed();
      store.getState().releaseHandle();
      await settle();
      expect(updates()).toEqual([]);
      expect(store.getState().moved).toBeNull();
    });

    it('brought back to where it was sends nothing', async () => {
      const store = grabbed();
      store.getState().dragHandle(NEW_FIRST);
      store.getState().dragHandle(A);
      store.getState().releaseHandle();
      await settle();
      expect(updates()).toEqual([]);
      expect(store.getState().moved).toBeNull();
    });

    it('dragged past the image, the vertex stays on its edge', () => {
      const store = grabbed();
      store.getState().dragHandle({ x: -0.4, y: 1.7 });
      const geometry = store.getState().moved?.geometry;
      expect(geometry?.shape === 'polygon' && geometry.points[0]).toEqual({ x: 0, y: 1 });
    });

    it('a shape with no area does not send and goes back', async () => {
      const region = mapRegion({
        geometry: {
          shape: 'polygon',
          points: [A, { x: 0.3, y: 0.3 }, { x: 0.4, y: 0.1 }],
        },
      });
      const store = flow();
      store.getState().grabHandle(region, 2);
      store.getState().dragHandle({ x: 0.5, y: 0.5 });
      store.getState().releaseHandle();
      await settle();
      expect(updates()).toEqual([]);
      expect(store.getState()).toMatchObject({ moved: null, failure: 'no_area' });
    });

    it('a pin moves by its one handle', async () => {
      const store = flow();
      store.getState().grabHandle(pinRegion(), 0);
      store.getState().dragHandle(C);
      store.getState().releaseHandle();
      await settle();
      expect(updates()[0]?.args[3]).toEqual({ geometry: { shape: 'pin', point: C } });
    });

    it('a dropped press puts the shape back and sends nothing', async () => {
      const store = grabbed();
      store.getState().dragHandle(NEW_FIRST);
      store.getState().dropHandle();
      await settle();
      expect(updates()).toEqual([]);
      expect(store.getState()).toMatchObject({ moved: null, grabbed: false });
    });

    it('Esc in the middle of a drag puts the shape back', async () => {
      const store = grabbed();
      store.getState().dragHandle(NEW_FIRST);
      store.getState().stepBack();
      store.getState().releaseHandle();
      await settle();
      expect(updates()).toEqual([]);
      expect(store.getState().moved).toBeNull();
    });

    it('a drag with no handle in hand does nothing', () => {
      const store = flow();
      store.getState().dragHandle(NEW_FIRST);
      expect(store.getState().moved).toBeNull();
    });

    it('no handle can be grabbed while a shape is on its way', async () => {
      api.heldRegionUpdates = [];
      const store = grabbed();
      store.getState().dragHandle(NEW_FIRST);
      store.getState().releaseHandle();
      await settle();
      store.getState().grabHandle(pinRegion(), 0);
      expect(store.getState().grabbed).toBe(false);
      expect(store.getState().moved?.regionId).toBe(CAPITAL_REGION_ID);
    });
  });
});
