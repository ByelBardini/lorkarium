import { describe, expect, it } from 'vitest';
import { createEffectAreaStyleStore, effectAreaStyleOf } from '@/stores/effect-area-style-store';
import { StorageFake } from '../support/storage-fake';

describe('effect area style store', () => {
  it('starts as a circle in ember with nothing stored', () => {
    const style = createEffectAreaStyleStore(new StorageFake()).getState();
    expect(effectAreaStyleOf(style)).toEqual({ kind: 'circle', color: 'ember' });
  });

  it('remembers the shape and the color under lorkarium.effectAreaStyle.*', () => {
    const storage = new StorageFake();
    const store = createEffectAreaStyleStore(storage);

    store.getState().setKind('diagonal_cone');
    store.getState().setColor('moss');

    expect(storage.values.get('lorkarium.effectAreaStyle.kind')).toBe('diagonal_cone');
    expect(storage.values.get('lorkarium.effectAreaStyle.color')).toBe('moss');
    expect(effectAreaStyleOf(createEffectAreaStyleStore(storage).getState())).toEqual({
      kind: 'diagonal_cone',
      color: 'moss',
    });
  });

  it('a stored value outside the lists falls back to the default', () => {
    const storage = new StorageFake();
    storage.setItem('lorkarium.effectAreaStyle.kind', 'hexagon');
    storage.setItem('lorkarium.effectAreaStyle.color', '#ff0000');

    const style = createEffectAreaStyleStore(storage).getState();

    expect(effectAreaStyleOf(style)).toEqual({ kind: 'circle', color: 'ember' });
  });

  it('a storage that throws keeps the choice in memory for the visit', () => {
    const store = createEffectAreaStyleStore(new StorageFake(true));

    store.getState().setKind('line');

    expect(store.getState().kind).toBe('line');
  });
});
