import { afterEach, describe, expect, it } from 'vitest';
import { editableFieldOf, textFieldStateOf } from '@/features/text-field-menu/text-field-target';

function inputOf(type: string, value = ''): HTMLInputElement {
  const input = document.createElement('input');
  input.type = type;
  input.value = value;
  document.body.append(input);
  return input;
}

describe('editableFieldOf', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it.each(['text', 'search', 'email', 'password', 'url', 'tel', 'number'])(
    'an input of type %s is a text field',
    (type) => {
      const input = inputOf(type);
      expect(editableFieldOf(input)).toBe(input);
    },
  );

  it('a textarea is a text field', () => {
    const textarea = document.createElement('textarea');
    expect(editableFieldOf(textarea)).toBe(textarea);
  });

  it.each(['checkbox', 'radio', 'range', 'file', 'color', 'button'])(
    'an input of type %s is not a text field',
    (type) => {
      expect(editableFieldOf(inputOf(type))).toBeNull();
    },
  );

  it('a paragraph or no target at all is not a text field', () => {
    expect(editableFieldOf(document.createElement('p'))).toBeNull();
    expect(editableFieldOf(null)).toBeNull();
  });
});

describe('textFieldStateOf', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('a filled editable field with a selection reports it', () => {
    const input = inputOf('text', 'Bia');
    input.setSelectionRange(0, 2);
    expect(textFieldStateOf(input)).toEqual({
      hasSelection: true,
      readOnly: false,
      disabled: false,
      empty: false,
      password: false,
    });
  });

  it('a caret alone is no selection', () => {
    const input = inputOf('text', 'Bia');
    input.setSelectionRange(2, 2);
    expect(textFieldStateOf(input).hasSelection).toBe(false);
  });

  it('readOnly, disabled, empty and password come from the element', () => {
    const input = inputOf('password');
    input.readOnly = true;
    input.disabled = true;
    expect(textFieldStateOf(input)).toEqual({
      hasSelection: false,
      readOnly: true,
      disabled: true,
      empty: true,
      password: true,
    });
  });
});
