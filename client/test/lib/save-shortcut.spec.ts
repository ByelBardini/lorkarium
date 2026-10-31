import { describe, expect, it } from 'vitest';
import { isSaveShortcut, type ShortcutKeys } from '@/lib/save-shortcut';

const NONE: ShortcutKeys = {
  key: 's',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
};

describe('isSaveShortcut', () => {
  it.each<[string, Partial<ShortcutKeys>, boolean]>([
    ['Ctrl+S', { ctrlKey: true }, true],
    ['Cmd+S', { metaKey: true }, true],
    ['Ctrl+S with Caps Lock', { ctrlKey: true, key: 'S' }, true],
    ['S alone', {}, false],
    ['Ctrl+Shift+S', { ctrlKey: true, shiftKey: true }, false],
    ['Ctrl+Alt+S', { ctrlKey: true, altKey: true }, false],
    ['Ctrl+D', { ctrlKey: true, key: 'd' }, false],
  ])('%s → %s', (_, keys, expected) => {
    expect(isSaveShortcut({ ...NONE, ...keys })).toBe(expected);
  });
});
