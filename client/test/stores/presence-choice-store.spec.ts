import { describe, expect, it } from 'vitest';
import {
  PRESENCE_CHOICE_STORAGE_KEY,
  createPresenceChoiceStore,
} from '@/stores/presence-choice-store';
import { StorageFake } from '../support/storage-fake';

describe('createPresenceChoiceStore', () => {
  it('starts Online and remembers Invisível across a reload', () => {
    const storage = new StorageFake();
    expect(createPresenceChoiceStore(storage).getState().choice).toBe('online');
    createPresenceChoiceStore(storage).getState().choose('invisible');
    expect(createPresenceChoiceStore(storage).getState().choice).toBe('invisible');
  });

  it('anything else stored is Online', () => {
    const storage = new StorageFake();
    storage.setItem(PRESENCE_CHOICE_STORAGE_KEY, 'away');
    expect(createPresenceChoiceStore(storage).getState().choice).toBe('online');
  });

  it('away is automatic and never stored', () => {
    const storage = new StorageFake();
    const store = createPresenceChoiceStore(storage);
    store.getState().setAway(true);
    expect(store.getState().away).toBe(true);
    expect(storage.getItem(PRESENCE_CHOICE_STORAGE_KEY)).toBeNull();
  });
});
