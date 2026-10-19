import { describe, expect, it } from 'vitest';
import { createLightReachStore, lightReachOf } from '@/stores/light-reach-store';
import { StorageFake } from '../support/storage-fake';

describe('createLightReachStore', () => {
  it('with nothing stored the next light is a torch: bright 4 and dim 4 cells', () => {
    expect(lightReachOf(createLightReachStore(new StorageFake()).getState())).toEqual({
      bright: 4,
      dim: 4,
    });
  });

  it('a reach set is remembered under lorkarium.lightReach.bright and .dim', () => {
    const storage = new StorageFake();

    createLightReachStore(storage).getState().setReach({ bright: 6, dim: 2.5 });

    expect(storage.values.get('lorkarium.lightReach.bright')).toBe('6');
    expect(storage.values.get('lorkarium.lightReach.dim')).toBe('2.5');
    expect(lightReachOf(createLightReachStore(storage).getState())).toEqual({
      bright: 6,
      dim: 2.5,
    });
  });

  it.each([['101'], ['-1'], ['seis']])('a stored bright of "%s" falls back to 4', (stored) => {
    const storage = new StorageFake();
    storage.values.set('lorkarium.lightReach.bright', stored);

    expect(createLightReachStore(storage).getState().bright).toBe(4);
  });

  it('a storage that throws keeps the torch and remembers in memory only', () => {
    const store = createLightReachStore(new StorageFake(true));

    store.getState().setReach({ bright: 8, dim: 0 });

    expect(lightReachOf(store.getState())).toEqual({ bright: 8, dim: 0 });
  });
});
