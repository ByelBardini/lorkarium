import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAWING_STYLE } from '@/lib/drawing-style';
import { createDrawingStyleStore, styleOf } from '@/stores/drawing-style-store';
import { StorageFake } from '../support/storage-fake';

describe('drawing style store', () => {
  it('starts on freehand, gold, no fill, medium line', () => {
    expect(styleOf(createDrawingStyleStore(new StorageFake()).getState())).toEqual(
      DEFAULT_DRAWING_STYLE,
    );
  });

  it('every choice comes back from the storage on a new store (after the room remounts)', () => {
    const storage = new StorageFake();
    const first = createDrawingStyleStore(storage).getState();
    first.setKind('ellipse');
    first.setStroke('violet');
    first.setFill('moss');
    first.setStrokeWidth('thick');

    expect(styleOf(createDrawingStyleStore(storage).getState())).toEqual({
      kind: 'ellipse',
      stroke: 'violet',
      fill: 'moss',
      strokeWidth: 'thick',
    });
  });

  it('"Nenhum" fill is remembered too', () => {
    const storage = new StorageFake();
    const store = createDrawingStyleStore(storage);
    store.getState().setFill('moss');
    store.getState().setFill(null);

    expect(createDrawingStyleStore(storage).getState().fill).toBeNull();
  });

  it('a value in the storage outside the palette falls back to the default', () => {
    const storage = new StorageFake();
    storage.setItem('lorkarium.drawingStyle.stroke', '#ff0000');

    expect(createDrawingStyleStore(storage).getState().stroke).toBe('gold');
  });

  it('a storage that throws keeps the default and the choices in memory', () => {
    const store = createDrawingStyleStore(new StorageFake(true));
    store.getState().setKind('triangle');

    expect(store.getState()).toMatchObject({ kind: 'triangle', stroke: 'gold' });
  });
});
