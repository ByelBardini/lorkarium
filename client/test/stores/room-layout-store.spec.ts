import { describe, expect, it } from 'vitest';
import {
  ROOM_PANEL_STORAGE_KEY,
  createRoomLayoutStore,
  isRoomTab,
} from '@/stores/room-layout-store';
import { StorageFake } from '../support/storage-fake';

describe('room layout store', () => {
  it('starts with the panel open on the combat tab and focus mode off', () => {
    const state = createRoomLayoutStore(new StorageFake()).getState();
    expect(state).toMatchObject({ panel: 'open', tab: 'combat', focus: false });
  });

  it('togglePanel closes the panel and remembers it as closed', () => {
    const storage = new StorageFake();
    const store = createRoomLayoutStore(storage);
    store.getState().togglePanel();
    expect(store.getState().panel).toBe('closed');
    expect(storage.values.get(ROOM_PANEL_STORAGE_KEY)).toBe('closed');
  });

  it('a panel remembered as closed starts closed', () => {
    const storage = new StorageFake();
    storage.values.set(ROOM_PANEL_STORAGE_KEY, 'closed');
    expect(createRoomLayoutStore(storage).getState().panel).toBe('closed');
  });

  it('an invalid remembered panel starts open', () => {
    const storage = new StorageFake();
    storage.values.set(ROOM_PANEL_STORAGE_KEY, 'half');
    expect(createRoomLayoutStore(storage).getState().panel).toBe('open');
  });

  it('showTab("people") opens a closed panel on that tab, and the tab is not stored', () => {
    const storage = new StorageFake();
    const store = createRoomLayoutStore(storage);
    store.getState().togglePanel();
    store.getState().showTab('people');
    expect(store.getState()).toMatchObject({ panel: 'open', tab: 'people' });
    expect([...storage.values.keys()]).toEqual([ROOM_PANEL_STORAGE_KEY]);
  });

  it('toggleFocus turns focus mode on and off, and exitFocus only turns it off', () => {
    const store = createRoomLayoutStore(new StorageFake());
    store.getState().toggleFocus();
    expect(store.getState().focus).toBe(true);
    store.getState().toggleFocus();
    expect(store.getState().focus).toBe(false);
    store.getState().exitFocus();
    expect(store.getState().focus).toBe(false);
    store.getState().toggleFocus();
    store.getState().exitFocus();
    expect(store.getState().focus).toBe(false);
  });

  it('focus mode is never stored', () => {
    const storage = new StorageFake();
    createRoomLayoutStore(storage).getState().toggleFocus();
    expect(storage.values.size).toBe(0);
  });

  it('a storage that throws keeps the panel in memory without breaking', () => {
    const store = createRoomLayoutStore(new StorageFake(true));
    store.getState().togglePanel();
    expect(store.getState().panel).toBe('closed');
  });

  it.each([
    ['combat', true],
    ['people', true],
    ['dice', true],
    ['chat', true],
    ['notes', false],
  ])('isRoomTab(%s) is %s', (value, expected) => {
    expect(isRoomTab(value)).toBe(expected);
  });
});
