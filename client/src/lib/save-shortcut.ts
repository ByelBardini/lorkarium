/** The part of a key event the save shortcut reads. */
export type ShortcutKeys = Readonly<{
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}>;

/** Ctrl+S (Cmd+S on a Mac), with no other modifier: "Salvar" without the mouse.
 *
 *  Example: `if (isSaveShortcut(event)) save()` */
export function isSaveShortcut(keys: ShortcutKeys): boolean {
  if (keys.altKey || keys.shiftKey) return false;
  if (!keys.ctrlKey && !keys.metaKey) return false;
  return keys.key.toLowerCase() === 's';
}
