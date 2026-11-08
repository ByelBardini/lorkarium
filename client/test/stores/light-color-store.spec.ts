import { describe, expect, it } from 'vitest';
import { createLightColorStore } from '@/stores/light-color-store';
import { StorageFake } from '../support/storage-fake';

const KEY = 'lorkarium.lightColor';

describe('light color store', () => {
  it('with nothing stored, the next light is neutral', () => {
    expect(createLightColorStore(new StorageFake()).getState().color).toBeNull();
  });

  it('choosing moon remembers it, and a new visit starts on moon', () => {
    const storage = new StorageFake();

    createLightColorStore(storage).getState().setColor('moon');

    expect(storage.values.get(KEY)).toBe('moon');
    expect(createLightColorStore(storage).getState().color).toBe('moon');
  });

  it('choosing neutral remembers "none" and a new visit starts neutral', () => {
    const storage = new StorageFake();
    storage.setItem(KEY, 'fire');

    createLightColorStore(storage).getState().setColor(null);

    expect(storage.values.get(KEY)).toBe('none');
    expect(createLightColorStore(storage).getState().color).toBeNull();
  });

  it('a stored "red", outside the palette, starts neutral', () => {
    const storage = new StorageFake();
    storage.setItem(KEY, 'red');

    expect(createLightColorStore(storage).getState().color).toBeNull();
  });

  it('choosing #336699 remembers it, and a new visit starts on #336699', () => {
    const storage = new StorageFake();

    createLightColorStore(storage).getState().setColor('#336699');

    expect(storage.values.get(KEY)).toBe('#336699');
    expect(createLightColorStore(storage).getState().color).toBe('#336699');
  });

  it.each(['#FFF', '#336699;x', 'url(x)'])('a stored %s, not a color, starts neutral', (stored) => {
    const storage = new StorageFake();
    storage.setItem(KEY, stored);

    expect(createLightColorStore(storage).getState().color).toBeNull();
  });

  it('a storage that throws starts neutral and keeps the choice in memory', () => {
    const store = createLightColorStore(new StorageFake(true));

    store.getState().setColor('arcane');

    expect(store.getState().color).toBe('arcane');
  });
});
