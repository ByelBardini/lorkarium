import { describe, expect, it } from 'vitest';
import { createAuraMotionStore } from '@/stores/aura-motion-store';
import { StorageFake } from '../support/storage-fake';

describe('createAuraMotionStore', () => {
  it('animates the auras by default', () => {
    expect(createAuraMotionStore(new StorageFake()).getState().animated).toBe(true);
  });

  it('turning it off is remembered under lorkarium.auraMotion', () => {
    const storage = new StorageFake();
    createAuraMotionStore(storage).getState().toggle();

    expect(storage.values.get('lorkarium.auraMotion')).toBe('off');
    expect(createAuraMotionStore(storage).getState().animated).toBe(false);
  });

  it('turning it on again animates and is remembered on', () => {
    const storage = new StorageFake();
    storage.values.set('lorkarium.auraMotion', 'off');
    const store = createAuraMotionStore(storage);

    store.getState().toggle();

    expect(store.getState().animated).toBe(true);
    expect(storage.values.get('lorkarium.auraMotion')).toBe('on');
  });

  it('an unknown stored value animates', () => {
    const storage = new StorageFake();
    storage.values.set('lorkarium.auraMotion', 'maybe');
    expect(createAuraMotionStore(storage).getState().animated).toBe(true);
  });

  it('a storage that throws animates, and the toggle still works in memory', () => {
    const store = createAuraMotionStore(new StorageFake(true));
    expect(store.getState().animated).toBe(true);

    store.getState().toggle();

    expect(store.getState().animated).toBe(false);
  });
});
