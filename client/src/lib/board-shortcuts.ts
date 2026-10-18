/** What a key press on the play room means. Zoom (+, −, 0) and W A S D belong to the board
 *  itself, which only hears them while focused. */
export type BoardShortcut =
  | 'toggle-focus'
  | 'escape'
  | 'select-tool'
  | 'ruler-tool'
  | 'draw-tool'
  | 'area-tool'
  | 'toggle-grid'
  | 'layer-tokens'
  | 'layer-objects'
  | 'layer-background';

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
  b: 'draw-tool',
  m: 'area-tool',
  g: 'toggle-grid',
  '1': 'layer-tokens',
  '2': 'layer-objects',
  '3': 'layer-background',
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

/** Editing the board: copy and paste the selection, undo and redo this user's own actions. */
export type EditShortcut = 'copy' | 'paste' | 'undo' | 'redo';

export type EditShortcutKey = ShortcutKey & Readonly<{ shiftKey: boolean }>;

const EDIT_BY_KEY: Readonly<Record<string, EditShortcut>> = {
  c: 'copy',
  v: 'paste',
  z: 'undo',
  y: 'redo',
};

/** The edit shortcut of a key press with Ctrl or ⌘ (Ctrl+Shift+Z also redoes), or `null`: in a
 *  field, a dialog or a menu the keys copy and undo there, not on the board.
 *
 *  Example: `editShortcutFor(event) // 'undo' for Ctrl+Z on the board` */
export function editShortcutFor(press: EditShortcutKey): EditShortcut | null {
  if (!(press.ctrlKey || press.metaKey) || press.altKey) return null;
  if (belongsToAnotherControl(press.target)) return null;
  const shortcut = EDIT_BY_KEY[press.key.toLowerCase()] ?? null;
  return shortcut === 'undo' && press.shiftKey ? 'redo' : shortcut;
}

function belongsToAnotherControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return true;
  return target.closest('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;
}
