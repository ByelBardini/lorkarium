import { afterEach, describe, expect, it } from 'vitest';
import {
  OWNS_ROOM_KEYS_ATTRIBUTE,
  editShortcutFor,
  homeShortcutFor,
  shortcutFor,
  tabShortcutFor,
  type ShortcutKey,
} from '@/lib/board-shortcuts';

function press(key: string, overrides: Partial<ShortcutKey> = {}): ShortcutKey {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: document.body,
    ...overrides,
  };
}

function mounted(html: string): Element {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  const target = host.querySelector('[data-target]');
  if (!target) throw new Error(`no [data-target] in ${html}`);
  return target;
}

describe('shortcutFor', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it.each(['m', 'M'])('%s picks the area of effect tool', (key) => {
    expect(shortcutFor(press(key))).toBe('area-tool');
  });

  it.each(['l', 'L'])('%s picks the lights tool', (key) => {
    expect(shortcutFor(press(key))).toBe('lights-tool');
  });

  it.each(['c', 'C'])('%s picks the condition tool', (key) => {
    expect(shortcutFor(press(key))).toBe('conditions-tool');
  });

  it.each(['ctrlKey', 'metaKey'] as const)(
    'C with %s is the copy, not the condition tool',
    (modifier) => {
      expect(shortcutFor(press('c', { [modifier]: true }))).toBeNull();
    },
  );

  it.each(['b', 'B'])('%s picks the draw tool', (key) => {
    expect(shortcutFor(press(key))).toBe('draw-tool');
  });

  it.each(['f', 'F'])('%s on the board toggles focus mode', (key) => {
    expect(shortcutFor(press(key))).toBe('toggle-focus');
  });

  it.each(['M', 'F'])('Shift+%s goes home, not to the tool or focus of the letter', (key) => {
    expect(shortcutFor(press(key, { shiftKey: true }))).toBeNull();
  });

  it('Escape is the escape shortcut (leave focus mode, drop the ruler)', () => {
    expect(shortcutFor(press('Escape'))).toBe('escape');
  });

  it.each([
    ['v', 'select-tool'],
    ['V', 'select-tool'],
    ['r', 'ruler-tool'],
    ['g', 'toggle-grid'],
  ])('%s is %s', (key, shortcut) => {
    expect(shortcutFor(press(key))).toBe(shortcut);
  });

  it.each([
    ['1', 'layer-tokens'],
    ['2', 'layer-objects'],
    ['3', 'layer-background'],
  ])('%s is %s', (key, shortcut) => {
    expect(shortcutFor(press(key))).toBe(shortcut);
  });

  it('2 typed in a field is text, and 2 with Ctrl belongs to the browser', () => {
    expect(shortcutFor(press('2', { target: mounted('<input data-target />') }))).toBeNull();
    expect(shortcutFor(press('2', { ctrlKey: true }))).toBeNull();
  });

  it.each([
    ['t', false],
    ['T', true],
  ])('%s (Shift %s) opens the chat', (key, shiftKey) => {
    expect(shortcutFor(press(key, { shiftKey }))).toBe('open-chat');
  });

  it.each(['ctrlKey', 'metaKey', 'altKey'] as const)(
    'T with %s belongs to the browser (Ctrl+T is a new tab)',
    (modifier) => {
      expect(shortcutFor(press('t', { [modifier]: true }))).toBeNull();
    },
  );

  it.each([
    '<input data-target />',
    '<textarea role="combobox" data-target></textarea>',
    '<div role="dialog"><button data-target>Salvar</button></div>',
  ])('T typed or pressed in %s is not the chat shortcut', (html) => {
    expect(shortcutFor(press('t', { target: mounted(html) }))).toBeNull();
  });

  it('an unknown key is no shortcut', () => {
    expect(shortcutFor(press('q'))).toBeNull();
  });

  it.each(['ctrlKey', 'metaKey', 'altKey'] as const)(
    'F with %s belongs to the browser',
    (modifier) => {
      expect(shortcutFor(press('f', { [modifier]: true }))).toBeNull();
    },
  );

  it.each([
    '<input data-target />',
    '<textarea data-target></textarea>',
    '<select data-target></select>',
    '<div contenteditable="true"><span data-target></span></div>',
  ])('F typed in %s is text, not a shortcut', (html) => {
    expect(shortcutFor(press('f', { target: mounted(html) }))).toBeNull();
  });

  it('F pressed inside an open dialog is not a shortcut', () => {
    const target = mounted('<div role="dialog"><button data-target>Salvar</button></div>');
    expect(shortcutFor(press('f', { target }))).toBeNull();
  });
});

describe('editShortcutFor', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function edit(key: string, overrides: Partial<ShortcutKey> = {}) {
    return editShortcutFor({ ...press(key, { ctrlKey: true }), ...overrides });
  }

  it.each([
    ['c', 'copy'],
    ['v', 'paste'],
    ['z', 'undo'],
    ['y', 'redo'],
    ['C', 'copy'],
  ])('Ctrl+%s is %s', (key, shortcut) => {
    expect(edit(key)).toBe(shortcut);
  });

  it('Ctrl+Shift+Z redoes too', () => {
    expect(edit('Z', { shiftKey: true })).toBe('redo');
  });

  it('⌘ works like Ctrl (macOS)', () => {
    expect(edit('c', { ctrlKey: false, metaKey: true })).toBe('copy');
  });

  it('the letter alone, or with Alt, is not an edit', () => {
    expect(edit('c', { ctrlKey: false })).toBeNull();
    expect(edit('c', { altKey: true })).toBeNull();
  });

  it('Ctrl+C in a text field or a dialog belongs to them, not to the board', () => {
    expect(edit('c', { target: mounted('<input data-target />') })).toBeNull();
    expect(
      edit('v', { target: mounted('<div role="dialog"><p data-target></p></div>') }),
    ).toBeNull();
  });
});

describe('homeShortcutFor', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it.each([
    ['M', 'main-map'],
    ['m', 'main-map'],
    ['F', 'main-sheet'],
    ['f', 'main-sheet'],
  ])('Shift+%s is %s', (key, shortcut) => {
    expect(homeShortcutFor(press(key, { shiftKey: true }))).toBe(shortcut);
  });

  it('the letter without Shift is the room key, not a home', () => {
    expect(homeShortcutFor(press('m'))).toBeNull();
    expect(homeShortcutFor(press('f'))).toBeNull();
  });

  it.each(['ctrlKey', 'metaKey', 'altKey'] as const)('Shift+M with %s is not a home', (mod) => {
    expect(homeShortcutFor(press('M', { shiftKey: true, [mod]: true }))).toBeNull();
  });

  it('Shift+F typed in a field or pressed in a menu belongs to them', () => {
    const field = mounted('<input data-target />');
    const menu = mounted('<div role="menu"><p data-target></p></div>');
    expect(homeShortcutFor(press('F', { shiftKey: true, target: field }))).toBeNull();
    expect(homeShortcutFor(press('M', { shiftKey: true, target: menu }))).toBeNull();
  });

  it('another letter with Shift is nothing', () => {
    expect(homeShortcutFor(press('V', { shiftKey: true }))).toBeNull();
  });
});

describe('tabShortcutFor', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('Ctrl+Tab is the next tab, Ctrl+Shift+Tab the previous one', () => {
    expect(tabShortcutFor(press('Tab', { ctrlKey: true }))).toBe('next-tab');
    expect(tabShortcutFor(press('Tab', { ctrlKey: true, shiftKey: true }))).toBe('previous-tab');
  });

  it.each([1, 3, 9])('Ctrl+%i is that tab', (n) => {
    expect(tabShortcutFor(press(String(n), { ctrlKey: true }))).toEqual({ nth: n });
  });

  it('Ctrl+W closes the tab', () => {
    expect(tabShortcutFor(press('w', { ctrlKey: true }))).toBe('close-tab');
    expect(tabShortcutFor(press('W', { ctrlKey: true }))).toBe('close-tab');
  });

  it.each([
    ['Alt+W', press('w', { altKey: true })],
    ['Ctrl+Alt+Tab', press('Tab', { ctrlKey: true, altKey: true })],
    ['⌘+W', press('w', { metaKey: true })],
    ['⌘+Tab', press('Tab', { metaKey: true })],
    ['Ctrl+0', press('0', { ctrlKey: true })],
    ['Ctrl+Shift+W', press('W', { ctrlKey: true, shiftKey: true })],
    ['Tab', press('Tab')],
  ])('%s is no tab shortcut', (_name, key) => {
    expect(tabShortcutFor(key)).toBeNull();
  });

  it('Ctrl+W typed in a field belongs to the field', () => {
    const field = mounted('<textarea data-target></textarea>');
    expect(tabShortcutFor(press('w', { ctrlKey: true, target: field }))).toBeNull();
  });
});

describe('shortcutFor: library and panel', () => {
  it('Shift+B toggles the library, B alone still draws', () => {
    expect(shortcutFor(press('B', { shiftKey: true }))).toBe('toggle-library');
    expect(shortcutFor(press('b'))).toBe('draw-tool');
  });

  it('\\ toggles the panel', () => {
    expect(shortcutFor(press('\\'))).toBe('toggle-panel');
    // [ and ] walk the selection between tokens (board-keys), never the panel.
    expect(shortcutFor(press(']'))).toBeNull();
  });

  it('Ctrl+Shift+B is not the library', () => {
    expect(shortcutFor(press('B', { shiftKey: true, ctrlKey: true }))).toBeNull();
  });
});

describe('keys inside a part that owns the room keys (the library drawer)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('the room keys and the homes stay there', () => {
    const item = mounted(`<aside ${OWNS_ROOM_KEYS_ATTRIBUTE}><div data-target></div></aside>`);
    expect(shortcutFor(press('r', { target: item }))).toBeNull();
    expect(shortcutFor(press('Escape', { target: item }))).toBeNull();
    expect(homeShortcutFor(press('M', { shiftKey: true, target: item }))).toBeNull();
    expect(editShortcutFor(press('c', { ctrlKey: true, target: item }))).toBeNull();
  });

  it('Shift+B still closes the library from there', () => {
    const item = mounted(`<aside ${OWNS_ROOM_KEYS_ATTRIBUTE}><div data-target></div></aside>`);
    expect(shortcutFor(press('B', { shiftKey: true, target: item }))).toBe('toggle-library');
  });

  it('Shift+B typed in a field there is a capital B', () => {
    const field = mounted(`<aside ${OWNS_ROOM_KEYS_ATTRIBUTE}><input data-target /></aside>`);
    expect(shortcutFor(press('B', { shiftKey: true, target: field }))).toBeNull();
  });
});
