import { describe, expect, it } from 'vitest';
import {
  clampCodeShare,
  clampConsoleHeight,
  DEFAULT_SHEET_EDITOR_LAYOUT,
  sheetEditorLayoutKey,
  storedSheetEditorLayout,
} from '@/lib/sheet-editor-layout';
import { StorageFake } from '../support/storage-fake';

describe('clampCodeShare', () => {
  it.each([
    [10, 25],
    [25, 25],
    [52.6, 53],
    [75, 75],
    [90, 75],
    [Number.NaN, DEFAULT_SHEET_EDITOR_LAYOUT.codeShare],
  ])('%d → %d', (share, kept) => expect(clampCodeShare(share)).toBe(kept));
});

describe('clampConsoleHeight', () => {
  it.each([
    [10, 96],
    [96, 96],
    [200.4, 200],
    [480, 480],
    [900, 480],
    [Number.POSITIVE_INFINITY, DEFAULT_SHEET_EDITOR_LAYOUT.consoleHeight],
  ])('%d → %d', (height, kept) => expect(clampConsoleHeight(height)).toBe(kept));
});

describe('storedSheetEditorLayout', () => {
  it('writes and reads back the layout of the person signed in', () => {
    const storage = new StorageFake();
    const memory = storedSheetEditorLayout(storage, () => 'ana');
    memory.write({ codeShare: 40, consoleOpen: false, consoleHeight: 240 });
    expect(memory.read()).toEqual({ codeShare: 40, consoleOpen: false, consoleHeight: 240 });
    expect(storage.values.has(sheetEditorLayoutKey('ana'))).toBe(true);
  });

  it('each person has a layout of their own', () => {
    const storage = new StorageFake();
    storedSheetEditorLayout(storage, () => 'ana').write({
      codeShare: 40,
      consoleOpen: false,
      consoleHeight: 240,
    });
    expect(storedSheetEditorLayout(storage, () => 'caio').read()).toEqual(
      DEFAULT_SHEET_EDITOR_LAYOUT,
    );
  });

  it('a layout stored before the console had a height gets the default height', () => {
    const storage = new StorageFake();
    storage.values.set(sheetEditorLayoutKey('ana'), '{"codeShare":40,"consoleOpen":false}');
    expect(storedSheetEditorLayout(storage, () => 'ana').read()).toEqual({
      codeShare: 40,
      consoleOpen: false,
      consoleHeight: DEFAULT_SHEET_EDITOR_LAYOUT.consoleHeight,
    });
  });

  it('nothing stored, a broken text or a storage that throws gives the default', () => {
    const storage = new StorageFake();
    storage.values.set(sheetEditorLayoutKey('ana'), '{not json');
    expect(storedSheetEditorLayout(storage, () => 'ana').read()).toEqual(
      DEFAULT_SHEET_EDITOR_LAYOUT,
    );
    expect(storedSheetEditorLayout(new StorageFake(), () => null).read()).toEqual(
      DEFAULT_SHEET_EDITOR_LAYOUT,
    );
    const blocked = storedSheetEditorLayout(new StorageFake(true), () => 'ana');
    expect(() =>
      blocked.write({ codeShare: 30, consoleOpen: true, consoleHeight: 192 }),
    ).not.toThrow();
    expect(blocked.read()).toEqual(DEFAULT_SHEET_EDITOR_LAYOUT);
  });

  it('a stored share out of bounds is brought back, a field of the wrong type is the default', () => {
    const storage = new StorageFake();
    storage.values.set(
      sheetEditorLayoutKey('ana'),
      '{"codeShare":99,"consoleOpen":"yes","consoleHeight":20}',
    );
    expect(storedSheetEditorLayout(storage, () => 'ana').read()).toEqual({
      codeShare: 75,
      consoleOpen: DEFAULT_SHEET_EDITOR_LAYOUT.consoleOpen,
      consoleHeight: 96,
    });
  });
});
