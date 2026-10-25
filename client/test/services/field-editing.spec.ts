import { afterEach, describe, expect, it } from 'vitest';
import { DocumentFieldEditing, type EditingCommands } from '@/services/field-editing';

type EditingCommandCall = Readonly<{
  command: string;
  value: string | undefined;
  focused: Element | null;
}>;

/** Stands in for `document.execCommand` (jsdom has none); records where the focus was. */
class EditingCommandsFake implements EditingCommands {
  readonly calls: EditingCommandCall[] = [];

  execCommand(command: string, showUi?: boolean, value?: string): boolean {
    void showUi;
    this.calls.push({ command, value, focused: document.activeElement });
    return true;
  }
}

function fieldWith(value: string): HTMLInputElement {
  const input = document.createElement('input');
  input.value = value;
  document.body.append(input);
  return input;
}

describe('DocumentFieldEditing', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('insertText focuses the field and inserts through execCommand insertText', () => {
    const commands = new EditingCommandsFake();
    const input = fieldWith('Bia');
    new DocumentFieldEditing(commands).insertText(input, ' Lima');
    expect(commands.calls).toEqual([{ command: 'insertText', value: ' Lima', focused: input }]);
  });

  it.each(['cut', 'copy'] as const)('%s focuses the field and runs that command', (command) => {
    const commands = new EditingCommandsFake();
    const input = fieldWith('Bia');
    new DocumentFieldEditing(commands)[command](input);
    expect(commands.calls).toEqual([{ command, value: undefined, focused: input }]);
  });

  it('selectAll focuses the field and selects its whole text', () => {
    const input = fieldWith('Bia Lima');
    new DocumentFieldEditing(new EditingCommandsFake()).selectAll(input);
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 8]);
  });
});
