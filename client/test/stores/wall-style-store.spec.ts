import { describe, expect, it } from 'vitest';
import { createWallStyleStore, wallStyleOf } from '@/stores/wall-style-store';
import { StorageFake } from '../support/storage-fake';

describe('createWallStyleStore', () => {
  it('without anything stored, the next wall is a straight Parede', () => {
    expect(wallStyleOf(createWallStyleStore(new StorageFake()).getState())).toEqual({
      kind: 'wall',
      shape: 'line',
    });
  });

  it('the kind and the shape chosen are remembered for the next visit', () => {
    const storage = new StorageFake();
    const first = createWallStyleStore(storage);

    first.getState().setKind('grate');
    first.getState().setShape('rectangle');

    expect(wallStyleOf(createWallStyleStore(storage).getState())).toEqual({
      kind: 'grate',
      shape: 'rectangle',
    });
  });

  it('a stored value outside the lists falls back to Parede and Reta', () => {
    const storage = new StorageFake();
    storage.setItem('lorkarium.wallStyle.kind', 'window');
    storage.setItem('lorkarium.wallStyle.shape', 'star');

    expect(wallStyleOf(createWallStyleStore(storage).getState())).toEqual({
      kind: 'wall',
      shape: 'line',
    });
  });
});
