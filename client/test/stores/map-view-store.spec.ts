import { beforeEach, describe, expect, it } from 'vitest';
import { createMapViewStore } from '@/stores/map-view-store';
import { VHARN } from '../support/campaigns-api-fake';
import { LibraryMapsApiFake } from '../support/library-maps-api-fake';
import {
  CAPITAL_REGION_ID,
  MUNDO_ID,
  REINO_ID,
  libraryMapDetail,
  mapRegion,
} from '../support/library-map-fixtures';

const CAMERA = { offsetX: 1, offsetY: 2, zoom: 0.5 };
const REGION_MAP_ID = 'e5a7c9db-5678-4e0f-8123-556677889900';
const OFFLINE = { ok: false, failure: { kind: 'offline' } } as const;
const REINO = libraryMapDetail({ id: REINO_ID, name: 'Reino', version: 1 });

describe('map view store', () => {
  let api: LibraryMapsApiFake;

  beforeEach(() => {
    api = new LibraryMapsApiFake();
    api.maps.set(MUNDO_ID, libraryMapDetail());
    api.maps.set(REINO_ID, REINO);
  });

  function view() {
    return createMapViewStore({ api, campaignId: VHARN.id, mapId: MUNDO_ID });
  }

  async function loaded() {
    const store = view();
    await store.getState().load();
    return store;
  }

  it('reads the map of its campaign and is ready', async () => {
    const store = view();
    expect(store.getState().status).toBe('loading');
    await store.getState().load();
    expect(store.getState().status).toBe('ready');
    expect(store.getState().map?.name).toBe('Mundo');
    expect(api.calls[0]).toEqual({ method: 'detail', args: [VHARN.id, MUNDO_ID] });
  });

  it('a newer version replaces the map', async () => {
    const store = await loaded();
    api.maps.set(MUNDO_ID, libraryMapDetail({ version: 4, name: 'Novo Mundo' }));
    await store.getState().load();
    expect(store.getState().map?.name).toBe('Novo Mundo');
  });

  it('an older version does not replace the current one', async () => {
    const store = await loaded();
    api.maps.set(MUNDO_ID, libraryMapDetail({ version: 2, name: 'Velho' }));
    await store.getState().load();
    expect(store.getState().map?.name).toBe('Mundo');
  });

  it('the same version with the same content keeps the object already on screen', async () => {
    const store = await loaded();
    const before = store.getState().map;
    api.maps.set(MUNDO_ID, libraryMapDetail());
    await store.getState().load();
    expect(store.getState().map).toBe(before);
  });

  it('the same version the reader may see differently is adopted (a link unlocked)', async () => {
    api.maps.set(
      MUNDO_ID,
      libraryMapDetail({ regions: [mapRegion({ link: { state: 'locked' } })] }),
    );
    const store = await loaded();
    api.maps.set(MUNDO_ID, libraryMapDetail({ regions: [mapRegion({ link: null })] }));
    await store.getState().load();
    expect(store.getState().map?.regions[0]?.link).toBeNull();
  });

  it('only the last read asked for lands, whatever order the answers come in', async () => {
    const store = await loaded();
    const held: NonNullable<LibraryMapsApiFake['heldDetails']> = [];
    api.heldDetails = held;
    const first = store.getState().load();
    const second = store.getState().load();
    held[1]?.({ ok: true, value: libraryMapDetail({ version: 6, name: 'Última' }) });
    held[0]?.({ ok: true, value: libraryMapDetail({ version: 9, name: 'Atrasada' }) });
    await Promise.all([first, second]);
    expect(store.getState().map?.name).toBe('Última');
  });

  it('losing access drops the map from the state', async () => {
    const store = await loaded();
    api.maps.delete(MUNDO_ID);
    await store.getState().load();
    expect(store.getState().status).toBe('not_found');
    expect(store.getState().map).toBeNull();
  });

  it('a failed reread keeps the map on screen', async () => {
    const store = await loaded();
    api.detailFailure = OFFLINE;
    await store.getState().load();
    expect(store.getState().status).toBe('ready');
    expect(store.getState().map?.name).toBe('Mundo');
  });

  it('a failed first read says so, and trying again recovers', async () => {
    api.detailFailure = OFFLINE;
    const store = view();
    await store.getState().load();
    expect(store.getState().status).toBe('failed');
    api.detailFailure = null;
    await store.getState().load();
    expect(store.getState().status).toBe('ready');
  });

  it('showing another map shows it framed anew, even with a smaller version', async () => {
    const store = await loaded();
    store.getState().setCamera(CAMERA);
    const going = store.getState().show(REINO_ID);
    expect(store.getState()).toMatchObject({
      mapId: REINO_ID,
      status: 'loading',
      map: null,
      camera: null,
    });
    await going;
    expect(store.getState().map?.name).toBe('Reino');
  });

  it('showing the same map keeps where the view is', async () => {
    const store = await loaded();
    store.getState().setCamera(CAMERA);
    await store.getState().show(MUNDO_ID);
    expect(store.getState().camera).toEqual(CAMERA);
  });

  it('a late answer for the map left behind does not bring it back', async () => {
    const store = await loaded();
    const held: NonNullable<LibraryMapsApiFake['heldDetails']> = [];
    api.heldDetails = held;
    const leaving = store.getState().load();
    const going = store.getState().show(REINO_ID);
    held[1]?.({ ok: true, value: REINO });
    held[0]?.({ ok: true, value: libraryMapDetail({ version: 8 }) });
    await Promise.all([leaving, going]);
    expect(store.getState().map?.id).toBe(REINO_ID);
  });

  it('an answer after dispose changes nothing', async () => {
    const store = view();
    const held: NonNullable<LibraryMapsApiFake['heldDetails']> = [];
    api.heldDetails = held;
    const reading = store.getState().load();
    store.getState().dispose();
    held[0]?.({ ok: true, value: libraryMapDetail() });
    await reading;
    expect(store.getState().map).toBeNull();
  });

  describe('trail', () => {
    async function inReino() {
      const store = await loaded();
      store.getState().setCamera(CAMERA);
      await store.getState().enter(REINO_ID);
      return store;
    }

    it('entering a map keeps the one left in the trail, with where its view was', async () => {
      const store = await inReino();
      expect(store.getState().map?.name).toBe('Reino');
      expect(store.getState().mapId).toBe(REINO_ID);
      expect(store.getState().camera).toBeNull();
      expect(store.getState().trail).toEqual([{ mapId: MUNDO_ID, name: 'Mundo', camera: CAMERA }]);
    });

    it('while the next map is read, the one on screen stays', async () => {
      const store = await loaded();
      const held: NonNullable<LibraryMapsApiFake['heldDetails']> = [];
      api.heldDetails = held;
      const going = store.getState().enter(REINO_ID);
      expect(store.getState().map?.name).toBe('Mundo');
      held[0]?.({ ok: true, value: REINO });
      expect(await going).toBe('arrived');
    });

    it('going back returns to the map left and to its framing', async () => {
      const store = await inReino();
      expect(await store.getState().goBack()).toBe('arrived');
      expect(store.getState().map?.name).toBe('Mundo');
      expect(store.getState().camera).toEqual(CAMERA);
      expect(store.getState().trail).toEqual([]);
    });

    it('returning to a step of the trail drops the steps after it', async () => {
      const third = libraryMapDetail({ id: REGION_MAP_ID, name: 'Vila', version: 1 });
      api.maps.set(REGION_MAP_ID, third);
      const store = await inReino();
      await store.getState().enter(REGION_MAP_ID);
      expect(store.getState().trail.map((step) => step.name)).toEqual(['Mundo', 'Reino']);
      await store.getState().returnTo(0);
      expect(store.getState().map?.name).toBe('Mundo');
      expect(store.getState().trail).toEqual([]);
    });

    it('a cycle A → B → A goes back to the step: the trail never repeats a map', async () => {
      const store = await inReino();
      expect(await store.getState().enter(MUNDO_ID)).toBe('arrived');
      expect(store.getState().map?.name).toBe('Mundo');
      expect(store.getState().trail).toEqual([]);
    });

    it('entering the map already shown stays where it is', async () => {
      const store = await loaded();
      expect(await store.getState().enter(MUNDO_ID)).toBe('arrived');
      expect(store.getState().trail).toEqual([]);
    });

    it('a map out of reach is reported, and the map on screen stays and is read again', async () => {
      const store = await loaded();
      api.maps.delete(REINO_ID);
      const reads = api.detailCalls();
      expect(await store.getState().enter(REINO_ID)).toBe('not_found');
      expect(store.getState()).toMatchObject({ mapId: MUNDO_ID, status: 'ready', trail: [] });
      expect(store.getState().map?.name).toBe('Mundo');
      expect(api.detailCalls()).toBe(reads + 2);
    });

    it('a failed read is reported apart from a lost map', async () => {
      const store = await loaded();
      api.detailFailure = OFFLINE;
      expect(await store.getState().enter(REINO_ID)).toBe('failed');
      expect(store.getState().map?.name).toBe('Mundo');
    });

    it('going back to a map out of reach takes its step away and stays', async () => {
      const store = await inReino();
      api.maps.delete(MUNDO_ID);
      expect(await store.getState().goBack()).toBe('not_found');
      expect(store.getState().map?.name).toBe('Reino');
      expect(store.getState().trail).toEqual([]);
    });

    it('a reread on the way does not cancel the trip', async () => {
      const store = await loaded();
      const held: NonNullable<LibraryMapsApiFake['heldDetails']> = [];
      api.heldDetails = held;
      const going = store.getState().enter(REINO_ID);
      void store.getState().load();
      held[0]?.({ ok: true, value: REINO });
      expect(await going).toBe('arrived');
      expect(store.getState().map?.name).toBe('Reino');
    });

    it('only the last trip lands', async () => {
      const store = await loaded();
      const held: NonNullable<LibraryMapsApiFake['heldDetails']> = [];
      api.heldDetails = held;
      const first = store.getState().enter(REINO_ID);
      const second = store.getState().enter(REGION_MAP_ID);
      held[0]?.({ ok: true, value: REINO });
      held[1]?.({ ok: true, value: libraryMapDetail({ id: REGION_MAP_ID, name: 'Vila' }) });
      expect(await first).toBe('dropped');
      expect(await second).toBe('arrived');
      expect(store.getState().map?.name).toBe('Vila');
      expect(store.getState().trail.map((step) => step.name)).toEqual(['Mundo']);
    });

    it('showing a map restarts the trail (opened by the library or the table name)', async () => {
      const store = await inReino();
      const held: NonNullable<LibraryMapsApiFake['heldDetails']> = [];
      api.heldDetails = held;
      const late = store.getState().enter(REGION_MAP_ID);
      const going = store.getState().show(MUNDO_ID);
      expect(store.getState().trail).toEqual([]);
      held[0]?.({ ok: true, value: libraryMapDetail({ id: REGION_MAP_ID, name: 'Vila' }) });
      held[1]?.({ ok: true, value: libraryMapDetail() });
      await Promise.all([late, going]);
      expect(store.getState().map?.name).toBe('Mundo');
      expect(store.getState().trail).toEqual([]);
    });

    it('showing the map already shown also restarts the trail, keeping the view', async () => {
      const store = await inReino();
      store.getState().setCamera(CAMERA);
      await store.getState().show(REINO_ID);
      expect(store.getState().trail).toEqual([]);
      expect(store.getState().camera).toEqual(CAMERA);
    });
  });

  describe('selection and focus', () => {
    it('selecting a region remembers it, and null lets go', async () => {
      const store = await loaded();
      store.getState().selectRegion(CAPITAL_REGION_ID);
      expect(store.getState().selectedRegionId).toBe(CAPITAL_REGION_ID);
      store.getState().selectRegion(null);
      expect(store.getState().selectedRegionId).toBeNull();
    });

    it('selecting by a click remembers the spot of the click', async () => {
      const store = await loaded();
      store.getState().selectRegion(CAPITAL_REGION_ID, { x: 0.3, y: 0.4 });
      expect(store.getState().selectedAnchor).toEqual({ x: 0.3, y: 0.4 });
    });

    it('selecting without a click, or letting go, forgets the spot', async () => {
      const store = await loaded();
      store.getState().selectRegion(CAPITAL_REGION_ID, { x: 0.3, y: 0.4 });
      store.getState().selectRegion(CAPITAL_REGION_ID);
      expect(store.getState().selectedAnchor).toBeNull();
    });

    it('a focus asked for after a click does not stay on the spot of that click', async () => {
      const store = await loaded();
      store.getState().selectRegion(CAPITAL_REGION_ID, { x: 0.3, y: 0.4 });
      store.getState().focusRegion(CAPITAL_REGION_ID);
      expect(store.getState().selectedAnchor).toBeNull();
    });

    it('asking to focus a region selects it and waits for the canvas', async () => {
      const store = await loaded();
      store.getState().focusRegion(CAPITAL_REGION_ID);
      expect(store.getState()).toMatchObject({
        selectedRegionId: CAPITAL_REGION_ID,
        focusRegionId: CAPITAL_REGION_ID,
      });
    });

    it('a focus that landed moves the camera and is over', async () => {
      const store = await loaded();
      store.getState().focusRegion(CAPITAL_REGION_ID);
      store.getState().landFocus(CAMERA);
      expect(store.getState()).toMatchObject({
        camera: CAMERA,
        focusRegionId: null,
        selectedRegionId: CAPITAL_REGION_ID,
      });
    });

    it('a focus on a region that is gone lets go of it and leaves the camera', async () => {
      const store = await loaded();
      store.getState().setCamera(CAMERA);
      store.getState().focusRegion(CAPITAL_REGION_ID);
      store.getState().landFocus(null);
      expect(store.getState()).toMatchObject({
        camera: CAMERA,
        focusRegionId: null,
        selectedRegionId: null,
      });
    });

    it('moving to another map lets go of the selection', async () => {
      const store = await loaded();
      store.getState().focusRegion(CAPITAL_REGION_ID);
      await store.getState().enter(REINO_ID);
      expect(store.getState()).toMatchObject({ selectedRegionId: null, focusRegionId: null });
    });

    it('showing another map lets go of the selection', async () => {
      const store = await loaded();
      store.getState().selectRegion(CAPITAL_REGION_ID);
      void store.getState().show(REINO_ID);
      expect(store.getState().selectedRegionId).toBeNull();
    });
  });

  describe('a region the server just confirmed', () => {
    const CAPITAL = mapRegion();
    const RENAMED = mapRegion({ name: 'Cidadela' });

    async function loadedWithCapital() {
      api.maps.set(MUNDO_ID, libraryMapDetail({ regions: [CAPITAL] }));
      return loaded();
    }

    it('a new one joins the map', async () => {
      const store = await loaded();
      store.getState().applyRegion(MUNDO_ID, CAPITAL);
      expect(store.getState().map?.regions).toEqual([CAPITAL]);
    });

    it('a known one is replaced where it is', async () => {
      const store = await loadedWithCapital();
      store.getState().applyRegion(MUNDO_ID, RENAMED);
      expect(store.getState().map?.regions).toEqual([RENAMED]);
    });

    it('the version stays: only a read says what the server has', async () => {
      const store = await loadedWithCapital();
      store.getState().applyRegion(MUNDO_ID, RENAMED);
      expect(store.getState().map?.version).toBe(3);
    });

    it('an answer about a map no longer shown changes nothing', async () => {
      const store = await loaded();
      await store.getState().enter(REINO_ID);
      store.getState().applyRegion(MUNDO_ID, CAPITAL);
      expect(store.getState().map?.regions).toEqual([]);
    });

    it('a removed one leaves the map and its card', async () => {
      const store = await loadedWithCapital();
      store.getState().selectRegion(CAPITAL_REGION_ID);
      store.getState().dropRegion(MUNDO_ID, CAPITAL_REGION_ID);
      expect(store.getState().map?.regions).toEqual([]);
      expect(store.getState().selectedRegionId).toBeNull();
    });

    it('removing another region keeps the card that is open', async () => {
      const store = await loadedWithCapital();
      store.getState().selectRegion(CAPITAL_REGION_ID);
      store.getState().dropRegion(MUNDO_ID, REGION_MAP_ID);
      expect(store.getState().selectedRegionId).toBe(CAPITAL_REGION_ID);
    });

    it('a removal on a map no longer shown changes nothing', async () => {
      api.maps.set(REINO_ID, libraryMapDetail({ id: REINO_ID, regions: [CAPITAL] }));
      const store = await loaded();
      await store.getState().enter(REINO_ID);
      store.getState().dropRegion(MUNDO_ID, CAPITAL_REGION_ID);
      expect(store.getState().map?.regions).toEqual([CAPITAL]);
    });
  });
});
