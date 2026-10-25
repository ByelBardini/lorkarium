/** A text field the field menu can act on. */
export type EditableField = HTMLInputElement | HTMLTextAreaElement;

/** Editing a text field like the keyboard does, behind a project interface (jsdom has no
 *  `execCommand`). Each command focuses the field first: the menu took the focus away. */
export interface FieldEditing {
  /** Replaces the selection with `text`, as typing it would. */
  insertText(field: EditableField, text: string): void;
  cut(field: EditableField): void;
  copy(field: EditableField): void;
  selectAll(field: EditableField): void;
}

/** The part of `Document` the editing commands go through. */
export type EditingCommands = Pick<Document, 'execCommand'>;

/** `FieldEditing` over `document.execCommand`, which keeps Ctrl+Z working and fires the
 *  `input` event a controlled React field listens to (assigning `value` would do neither).
 *
 *  Example: `new DocumentFieldEditing(document).insertText(input, 'Bia')` */
export class DocumentFieldEditing implements FieldEditing {
  constructor(private readonly commands: EditingCommands) {}

  insertText(field: EditableField, text: string): void {
    field.focus();
    this.commands.execCommand('insertText', false, text);
  }

  cut(field: EditableField): void {
    field.focus();
    this.commands.execCommand('cut');
  }

  copy(field: EditableField): void {
    field.focus();
    this.commands.execCommand('copy');
  }

  selectAll(field: EditableField): void {
    field.focus();
    field.select();
  }
}
