import { describe, expect, it } from 'vitest';
import { createRailStore, RAIL_STORAGE_KEY } from '@/stores/rail-store';
import { StorageFake } from '../support/storage-fake';

describe('createRailStore', () => {
  it('the first visit starts expanded', () => {
    expect(createRailStore(new StorageFake()).getState().rail).toBe('expanded');
  });

  it('toggle collapses the rail and writes the choice to the storage', () => {
    const storage = new StorageFake();
    const store = createRailStore(storage);
    store.getState().toggle();
    expect(store.getState().rail).toBe('collapsed');
    expect(storage.values.get(RAIL_STORAGE_KEY)).toBe('collapsed');
  });

  it('a new store over the same storage starts where the last one stopped', () => {
    const storage = new StorageFake();
    createRailStore(storage).getState().toggle();
    expect(createRailStore(storage).getState().rail).toBe('collapsed');
  });

  it('toggling twice expands again', () => {
    const store = createRailStore(new StorageFake());
    store.getState().toggle();
    store.getState().toggle();
    expect(store.getState().rail).toBe('expanded');
  });

  it('a storage that throws on read and write still works in memory from the default', () => {
    const store = createRailStore(new StorageFake(true));
    expect(store.getState().rail).toBe('expanded');
    store.getState().toggle();
    expect(store.getState().rail).toBe('collapsed');
  });

  it('an unknown stored value falls back to the default', () => {
    const storage = new StorageFake();
    storage.values.set(RAIL_STORAGE_KEY, 'sideways');
    expect(createRailStore(storage).getState().rail).toBe('expanded');
  });
});
