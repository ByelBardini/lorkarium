import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { createSavedColorsStore, type SavedColorsStore } from '@/stores/saved-colors-store';
import { SavedColorsApiFake } from '../support/saved-colors-api-fake';

const OFFLINE = { ok: false, failure: { kind: 'offline' } } as const;

describe('createSavedColorsStore', () => {
  let api: SavedColorsApiFake;
  let store: StoreApi<SavedColorsStore>;

  beforeEach(() => {
    api = new SavedColorsApiFake();
    store = createSavedColorsStore(api);
  });

  it('starts empty and with no problem', () => {
    expect(store.getState().colors).toEqual([]);
    expect(store.getState().problem).toBeNull();
  });

  it('load fills the list with the answer of the server', async () => {
    api.colors = ['#336699', '#aabbcc'];

    await store.getState().load();

    expect(store.getState().colors).toEqual(['#336699', '#aabbcc']);
  });

  it('save replaces the list by the answer, not by a guess', async () => {
    api.colors = ['#aabbcc'];
    api.answers.answer('save', { ok: true, value: ['#112233', '#aabbcc'] });

    await store.getState().save('#336699');

    expect(store.getState().colors).toEqual(['#112233', '#aabbcc']);
  });

  it('remove replaces the list by the answer', async () => {
    api.colors = ['#336699', '#aabbcc'];
    await store.getState().load();

    await store.getState().remove('#336699');

    expect(store.getState().colors).toEqual(['#aabbcc']);
  });

  it('a failed save keeps the list and stores the problem', async () => {
    api.colors = ['#336699'];
    await store.getState().load();
    api.answers.answer('save', OFFLINE);

    await store.getState().save('#aabbcc');

    expect(store.getState().colors).toEqual(['#336699']);
    expect(store.getState().problem).toEqual({ kind: 'offline' });
  });

  it('a failed load keeps the last known list and stores the problem', async () => {
    api.colors = ['#336699'];
    await store.getState().load();
    api.answers.answer('list', OFFLINE);

    await store.getState().load();

    expect(store.getState().colors).toEqual(['#336699']);
    expect(store.getState().problem).toEqual({ kind: 'offline' });
  });

  it('the next success clears the problem', async () => {
    api.answers.answer('save', OFFLINE);
    await store.getState().save('#aabbcc');
    api.answers.clear('save');

    await store.getState().save('#aabbcc');

    expect(store.getState().problem).toBeNull();
  });

  it('an old load answering after a newer save does not overwrite it', async () => {
    const answerLoad = api.answers.hold('list');
    const loading = store.getState().load();
    await store.getState().save('#336699');

    answerLoad({ ok: true, value: [] });
    await loading;

    expect(store.getState().colors).toEqual(['#336699']);
  });

  it('an old load failing after a newer save does not report a problem', async () => {
    const answerLoad = api.answers.hold('list');
    const loading = store.getState().load();
    await store.getState().save('#336699');

    answerLoad(OFFLINE);
    await loading;

    expect(store.getState().problem).toBeNull();
  });

  it('the answer of an older save does not overwrite the one of a newer remove', async () => {
    const answerSave = api.answers.hold('save');
    const saving = store.getState().save('#336699');
    api.answers.answer('remove', { ok: true, value: ['#aabbcc'] });
    await store.getState().remove('#112233');

    answerSave({ ok: true, value: ['#336699', '#112233', '#aabbcc'] });
    await saving;

    expect(store.getState().colors).toEqual(['#aabbcc']);
  });

  it('of two loads, only the answer of the newest counts', async () => {
    const answerFirst = api.answers.hold('list');
    const first = store.getState().load();
    api.answers.clear('list');
    api.colors = ['#336699'];
    await store.getState().load();

    answerFirst({ ok: true, value: ['#000000'] });
    await first;

    expect(store.getState().colors).toEqual(['#336699']);
  });
});
