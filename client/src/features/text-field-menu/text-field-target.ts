import type { EditableField } from '@/services/field-editing';
import type { TextFieldState } from './text-field-menu-items';

/** The text field a right click landed on, or `null` (a checkbox, a button, the board).
 *
 *  Example: `editableFieldOf(event.target)` */
export function editableFieldOf(target: EventTarget | null): EditableField | null {
  if (target instanceof HTMLTextAreaElement) return target;
  if (target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type)) return target;
  return null;
}

const TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  'text',
  'search',
  'email',
  'password',
  'url',
  'tel',
  'number',
]);

/** What the field allows right now, read from the DOM.
 *
 *  Example: `textFieldMenuItemsOf(textFieldStateOf(input))` */
export function textFieldStateOf(field: EditableField): TextFieldState {
  return {
    hasSelection: hasSelectionIn(field),
    readOnly: field.readOnly,
    disabled: field.disabled,
    empty: field.value === '',
    password: field.type === 'password',
  };
}

// `email` and `number` inputs answer `null` to `selectionStart`; Chromium (the WebView2) still
// reports their selected text through the document selection.
function hasSelectionIn(field: EditableField): boolean {
  if (field.selectionStart !== null) return field.selectionStart !== field.selectionEnd;
  return (field.ownerDocument.getSelection()?.toString() ?? '') !== '';
}
