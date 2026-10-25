import type { EditableField, FieldEditing } from '@/services/field-editing';

export type FieldEditingCall = Readonly<{
  command: 'insertText' | 'cut' | 'copy' | 'selectAll';
  field: EditableField;
  text?: string;
}>;

/** Records each command and plays `insertText` the way the browser's `execCommand` does:
 *  the selection is replaced through the native `value` setter and an `input` event bubbles,
 *  so a controlled React field sees an `onChange`. */
export class FieldEditingFake implements FieldEditing {
  readonly calls: FieldEditingCall[] = [];

  insertText(field: EditableField, text: string): void {
    this.calls.push({ command: 'insertText', field, text });
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    const next = field.value.slice(0, start) + text + field.value.slice(end);
    const prototype = Object.getPrototypeOf(field) as object;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, next);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  cut(field: EditableField): void {
    this.calls.push({ command: 'cut', field });
  }

  copy(field: EditableField): void {
    this.calls.push({ command: 'copy', field });
  }

  selectAll(field: EditableField): void {
    this.calls.push({ command: 'selectAll', field });
  }
}
