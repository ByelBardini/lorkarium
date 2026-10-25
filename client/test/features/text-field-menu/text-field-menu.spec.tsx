import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { TextFieldMenu } from '@/features/text-field-menu/text-field-menu';
import { ClipboardFake } from '../../support/clipboard-fake';
import { FieldEditingFake } from '../../support/field-editing-fake';

type NameFormProps = Readonly<{
  onNameChange: (value: string) => void;
  /** Another menu (like a Radix context menu) already took the right click. */
  claimRightClick?: boolean;
}>;

function NameForm({ onNameChange, claimRightClick = false }: NameFormProps): React.JSX.Element {
  const [name, setName] = useState('Bia');
  const change = (value: string): void => {
    setName(value);
    onNameChange(value);
  };
  return (
    <div onContextMenu={claimRightClick ? (event) => event.preventDefault() : undefined}>
      <label>
        Nome
        <input value={name} onChange={(event) => change(event.target.value)} />
      </label>
      <p>Fora do campo</p>
    </div>
  );
}

describe('TextFieldMenu', () => {
  let clipboard: ClipboardFake;
  let fieldEditing: FieldEditingFake;
  let changes: string[];

  beforeEach(() => {
    clipboard = new ClipboardFake();
    fieldEditing = new FieldEditingFake();
    changes = [];
  });

  function renderForm(isDesktop: boolean, claimRightClick = false): HTMLInputElement {
    render(
      <>
        <NameForm onNameChange={(value) => changes.push(value)} claimRightClick={claimRightClick} />
        <TextFieldMenu isDesktop={isDesktop} clipboard={clipboard} fieldEditing={fieldEditing} />
      </>,
    );
    return screen.getByLabelText('Nome');
  }

  async function settle(): Promise<void> {
    await act(async () => {});
  }

  it('a right click on the field opens the Lorkarium menu and cancels the browser one', async () => {
    const input = renderForm(true);
    expect(fireEvent.contextMenu(input)).toBe(false);
    await screen.findByRole('menu');
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'RecortarCtrl+X',
      'CopiarCtrl+C',
      'ColarCtrl+V',
      'Selecionar tudoCtrl+A',
    ]);
  });

  it('the items follow the field: with only a caret Recortar and Copiar are disabled', async () => {
    const input = renderForm(true);
    input.setSelectionRange(3, 3);
    fireEvent.contextMenu(input);
    expect(await screen.findByRole('menuitem', { name: /Recortar/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: /Colar/ })).not.toHaveAttribute('aria-disabled');
  });

  it('Colar inserts the clipboard text at the caret and the controlled onChange fires', async () => {
    clipboard.pasteText = ' Lima';
    const input = renderForm(true);
    input.setSelectionRange(3, 3);
    fireEvent.contextMenu(input);
    await userEvent.click(await screen.findByRole('menuitem', { name: /Colar/ }));
    await waitFor(() => expect(changes).toEqual(['Bia Lima']));
    expect(input).toHaveValue('Bia Lima');
    expect(fieldEditing.calls).toEqual([{ command: 'insertText', field: input, text: ' Lima' }]);
  });

  it('Colar with the clipboard read refused does nothing and does not break', async () => {
    clipboard = new ClipboardFake(true);
    const input = renderForm(true);
    fireEvent.contextMenu(input);
    await userEvent.click(await screen.findByRole('menuitem', { name: /Colar/ }));
    await settle();
    expect(fieldEditing.calls).toEqual([]);
    expect(changes).toEqual([]);
    expect(input).toHaveValue('Bia');
  });

  it.each([
    ['Recortar', 'cut'],
    ['Copiar', 'copy'],
    ['Selecionar tudo', 'selectAll'],
  ] as const)(
    '%s runs the %s command on the field that was right clicked',
    async (label, command) => {
      const input = renderForm(true);
      input.setSelectionRange(0, 3);
      fireEvent.contextMenu(input);
      await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(label) }));
      expect(fieldEditing.calls).toEqual([{ command, field: input }]);
    },
  );

  it('closing the menu gives the focus back to the field', async () => {
    const input = renderForm(true);
    fireEvent.contextMenu(input);
    await screen.findByRole('menu');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(input).toHaveFocus();
  });

  it('a right click outside a text field opens no menu and leaves the event alone', async () => {
    renderForm(true);
    expect(fireEvent.contextMenu(screen.getByText('Fora do campo'))).toBe(true);
    await settle();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('a right click another menu already handled (defaultPrevented) opens no menu', async () => {
    const input = renderForm(true, true);
    fireEvent.contextMenu(input);
    await settle();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('outside the desktop shell no menu opens and the browser keeps its own', async () => {
    const input = renderForm(false);
    expect(fireEvent.contextMenu(input)).toBe(true);
    await settle();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
