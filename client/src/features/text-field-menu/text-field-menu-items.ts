export type TextFieldAction = 'cut' | 'copy' | 'paste' | 'selectAll';

/** What the field allows at the moment of the right click. */
export type TextFieldState = Readonly<{
  hasSelection: boolean;
  readOnly: boolean;
  disabled: boolean;
  empty: boolean;
  /** `type="password"`: its text never leaves the field. */
  password: boolean;
}>;

export type TextFieldMenuItem = Readonly<{
  action: TextFieldAction;
  label: string;
  shortcut: string;
  enabled: boolean;
}>;

/** The four items of the field menu, in order, each enabled by what the field allows.
 *
 *  Example: `textFieldMenuItemsOf({ hasSelection: true, readOnly: false, disabled: false, empty: false, password: false })` */
export function textFieldMenuItemsOf(state: TextFieldState): TextFieldMenuItem[] {
  const allowed = allowedActionsOf(state);
  return MENU_ENTRIES.map((entry) => ({ ...entry, enabled: allowed[entry.action] }));
}

const MENU_ENTRIES: readonly Omit<TextFieldMenuItem, 'enabled'>[] = [
  { action: 'cut', label: 'Recortar', shortcut: 'Ctrl+X' },
  { action: 'copy', label: 'Copiar', shortcut: 'Ctrl+C' },
  { action: 'paste', label: 'Colar', shortcut: 'Ctrl+V' },
  { action: 'selectAll', label: 'Selecionar tudo', shortcut: 'Ctrl+A' },
];

function allowedActionsOf(state: TextFieldState): Record<TextFieldAction, boolean> {
  const live = !state.disabled;
  const copyable = live && state.hasSelection && !state.password;
  return {
    cut: copyable && !state.readOnly,
    copy: copyable,
    paste: live && !state.readOnly,
    selectAll: live && !state.empty,
  };
}
