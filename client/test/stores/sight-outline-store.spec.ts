import type { SightOutlineDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { createSightOutlineStore, type SightOutlineStore } from '@/stores/sight-outline-store';
import { AssetOutlineApiFake } from '../support/asset-outline-api-fake';

const STATUE = '11112222-3333-4444-8555-666677778888';
const WAGON = '99990000-aaaa-4bbb-8ccc-ddddeeeeffff';
const TRIANGLE: SightOutlineDto = [
  [
    [0.5, 0],
    [1, 1],
    [0, 1],
  ],
];

describe('createSightOutlineStore', () => {
  let api: AssetOutlineApiFake;
  let store: StoreApi<SightOutlineStore>;

  const request = (...assetIds: string[]) => store.getState().request(assetIds);
  const outlineOf = (assetId: string) => store.getState().outlines.get(assetId);

  beforeEach(() => {
    api = new AssetOutlineApiFake();
    store = createSightOutlineStore(api);
  });

  it('starts knowing no outline', () => {
    expect(store.getState().outlines.size).toBe(0);
  });

  it('keeps the outline the server answers', async () => {
    api.answer(STATUE, TRIANGLE);

    await request(STATUE);

    expect(outlineOf(STATUE)).toEqual(TRIANGLE);
  });

  it('keeps an older image as null and a transparent one as empty: they are not the same', async () => {
    api.answer(STATUE, null);
    api.answer(WAGON, []);

    await request(STATUE, WAGON);

    expect(outlineOf(STATUE)).toBeNull();
    expect(outlineOf(WAGON)).toEqual([]);
  });

  it('an asset still on its way is not known yet, so nothing tells it apart from an older image', async () => {
    api.answer(STATUE, TRIANGLE);
    api.hold();

    const asked = request(STATUE);

    expect(store.getState().outlines.has(STATUE)).toBe(false);
    api.release();
    await asked;
    expect(outlineOf(STATUE)).toEqual(TRIANGLE);
  });

  it('two requests of the same asset, one after the other, fetch once', async () => {
    await request(STATUE);
    await request(STATUE);

    expect(api.asked).toEqual([STATUE]);
  });

  it('a request while the first is on its way does not fetch again', async () => {
    api.hold();

    const first = request(STATUE);
    const second = request(STATUE);

    expect(api.asked).toEqual([STATUE]);
    api.release();
    await Promise.all([first, second]);
  });

  it('the same asset twice in one request fetches once', async () => {
    await request(STATUE, STATUE);

    expect(api.asked).toEqual([STATUE]);
  });

  it('a failure stays as null, the rectangle of the footprint', async () => {
    api.failFor(STATUE, { kind: 'offline' });

    await request(STATUE);

    expect(store.getState().outlines.has(STATUE)).toBe(true);
    expect(outlineOf(STATUE)).toBeNull();
  });

  it('a failed asset is not fetched again: no loop on a table that asks at every change', async () => {
    api.failFor(STATUE, { kind: 'not_found' });

    await request(STATUE);
    await request(STATUE);

    expect(api.asked).toEqual([STATUE]);
  });

  it('an image swapped for another fetches the new one and keeps the old one', async () => {
    api.answer(STATUE, TRIANGLE);
    api.answer(WAGON, []);

    await request(STATUE);
    await request(WAGON);

    expect(api.asked).toEqual([STATUE, WAGON]);
    expect(outlineOf(STATUE)).toEqual(TRIANGLE);
    expect(outlineOf(WAGON)).toEqual([]);
  });

  it('the outlines of one request arrive at once: one change of state, one new geometry', async () => {
    let changes = 0;
    store.subscribe(() => {
      changes += 1;
    });

    await request(STATUE, WAGON);

    expect(changes).toBe(1);
  });

  it('a request of what is known keeps the same map, and the memories keyed by it', async () => {
    await request(STATUE);
    const known = store.getState().outlines;

    await request(STATUE);

    expect(store.getState().outlines).toBe(known);
  });

  it('a request of nothing fetches nothing and keeps the same map', async () => {
    const known = store.getState().outlines;

    await request();

    expect(api.asked).toEqual([]);
    expect(store.getState().outlines).toBe(known);
  });

  it('an answer does not forget what another request brought meanwhile', async () => {
    api.answer(STATUE, TRIANGLE);
    api.hold();
    const held = request(STATUE);
    api.release();
    api.answer(WAGON, []);

    await Promise.all([held, request(WAGON)]);

    expect(outlineOf(STATUE)).toEqual(TRIANGLE);
    expect(outlineOf(WAGON)).toEqual([]);
  });
});
