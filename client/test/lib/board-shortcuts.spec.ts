import { afterEach, describe, expect, it } from 'vitest';
import { editShortcutFor, shortcutFor, type ShortcutKey } from '@/lib/board-shortcuts';

function press(key: string, overrides: Partial<ShortcutKey> = {}): ShortcutKey {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
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

  it.each(['b', 'B'])('%s picks the draw tool', (key) => {
    expect(shortcutFor(press(key))).toBe('draw-tool');
  });

  it.each(['f', 'F'])('%s on the board toggles focus mode', (key) => {
    expect(shortcutFor(press(key))).toBe('toggle-focus');
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

  function edit(key: string, overrides: Partial<ShortcutKey> & { shiftKey?: boolean } = {}) {
    return editShortcutFor({ ...press(key, { ctrlKey: true }), shiftKey: false, ...overrides });
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
