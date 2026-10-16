/** What a key press on the play room means. Zoom (+, −, 0) and W A S D belong to the board
 *  itself, which only hears them while focused. */
export type BoardShortcut =
  'toggle-focus' | 'escape' | 'select-tool' | 'ruler-tool' | 'toggle-grid';

/** The part of a `KeyboardEvent` the mapping reads, so it is testable without the DOM event. */
export type ShortcutKey = Readonly<{
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}>;

const SHORTCUT_BY_KEY: Readonly<Record<string, BoardShortcut>> = {
  f: 'toggle-focus',
  v: 'select-tool',
  r: 'ruler-tool',
  g: 'toggle-grid',
  escape: 'escape',
};

/** The room shortcut of a key press, or `null`: keys typed in a field, inside a dialog or with
 *  Ctrl/⌘/Alt belong to someone else.
 *
 *  Example: `shortcutFor(event) // 'toggle-focus' for an F pressed on the board` */
export function shortcutFor(press: ShortcutKey): BoardShortcut | null {
  if (press.ctrlKey || press.metaKey || press.altKey) return null;
  if (belongsToAnotherControl(press.target)) return null;
  return SHORTCUT_BY_KEY[press.key.toLowerCase()] ?? null;
}

function belongsToAnotherControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return true;
  return target.closest('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;
}
