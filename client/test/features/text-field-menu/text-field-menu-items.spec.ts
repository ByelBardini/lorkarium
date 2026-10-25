import { describe, expect, it } from 'vitest';
import {
  textFieldMenuItemsOf,
  type TextFieldState,
} from '@/features/text-field-menu/text-field-menu-items';

const EDITABLE_WITH_SELECTION: TextFieldState = {
  hasSelection: true,
  readOnly: false,
  disabled: false,
  empty: false,
  password: false,
};

function enabledOf(overrides: Partial<TextFieldState>): Record<string, boolean> {
  const items = textFieldMenuItemsOf({ ...EDITABLE_WITH_SELECTION, ...overrides });
  return Object.fromEntries(items.map((item) => [item.label, item.enabled]));
}

describe('textFieldMenuItemsOf', () => {
  it('lists Recortar, Copiar, Colar and Selecionar tudo with their shortcuts, in that order', () => {
    const items = textFieldMenuItemsOf(EDITABLE_WITH_SELECTION);
    expect(items.map((item) => [item.action, item.label, item.shortcut])).toEqual([
      ['cut', 'Recortar', 'Ctrl+X'],
      ['copy', 'Copiar', 'Ctrl+C'],
      ['paste', 'Colar', 'Ctrl+V'],
      ['selectAll', 'Selecionar tudo', 'Ctrl+A'],
    ]);
  });

  it('an editable field with a selection enables all four', () => {
    expect(enabledOf({})).toEqual({
      Recortar: true,
      Copiar: true,
      Colar: true,
      'Selecionar tudo': true,
    });
  });

  it('without a selection Recortar and Copiar are disabled', () => {
    expect(enabledOf({ hasSelection: false })).toEqual({
      Recortar: false,
      Copiar: false,
      Colar: true,
      'Selecionar tudo': true,
    });
  });

  it('a read-only field disables Recortar and Colar but still copies', () => {
    expect(enabledOf({ readOnly: true })).toEqual({
      Recortar: false,
      Copiar: true,
      Colar: false,
      'Selecionar tudo': true,
    });
  });

  it('an empty field disables Selecionar tudo', () => {
    expect(enabledOf({ empty: true, hasSelection: false })).toEqual({
      Recortar: false,
      Copiar: false,
      Colar: true,
      'Selecionar tudo': false,
    });
  });

  it('a password field never cuts or copies its text, even selected', () => {
    expect(enabledOf({ password: true })).toEqual({
      Recortar: false,
      Copiar: false,
      Colar: true,
      'Selecionar tudo': true,
    });
  });

  it('a disabled field disables everything', () => {
    expect(enabledOf({ disabled: true })).toEqual({
      Recortar: false,
      Copiar: false,
      Colar: false,
      'Selecionar tudo': false,
    });
  });
});
