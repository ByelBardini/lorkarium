import { Editor } from '@tiptap/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { DocumentEditorMenu } from '@/rich-text-editor/document-editor-menu';
import { documentExtensions } from '@/rich-text-editor/document-extensions';
import { ClipboardFake } from '../support/clipboard-fake';

const activeEditors: Editor[] = [];
afterEach(() => activeEditors.splice(0).forEach((editor) => editor.destroy()));
function menu(editable = true, desktop = true) {
  const editor = new Editor({
    extensions: documentExtensions((id) => `/api/assets/${id}`),
    content: '<p>Carta secreta</p>',
    editable,
  });
  activeEditors.push(editor);
  editor.commands.setTextSelection({ from: 1, to: 6 });
  const clipboard = new ClipboardFake();
  render(
    <DocumentEditorMenu editor={editor} clipboard={clipboard} desktop={desktop}>
      <div data-testid="editor-menu">Área do editor</div>
    </DocumentEditorMenu>,
  );
  return { editor, clipboard };
}
describe('document contenteditable desktop menu', () => {
  it('copies only the selected document text', async () => {
    const { clipboard } = menu();
    fireEvent.contextMenu(screen.getByTestId('editor-menu'));
    await userEvent.click(await screen.findByRole('menuitem', { name: /^Copiar/ }));
    await waitFor(() => expect(clipboard.copied).toEqual(['Carta']));
  });
  it('cuts selected text only after the clipboard accepts it', async () => {
    const { editor, clipboard } = menu();
    fireEvent.contextMenu(screen.getByTestId('editor-menu'));
    await userEvent.click(await screen.findByRole('menuitem', { name: /^Recortar/ }));
    await waitFor(() => expect(editor.getText()).toBe(' secreta'));
    expect(clipboard.copied).toEqual(['Carta']);
  });
  it('keeps a public reader copyable and disables all content mutations', async () => {
    menu(false);
    fireEvent.contextMenu(screen.getByTestId('editor-menu'));
    expect(await screen.findByRole('menuitem', { name: /^Recortar/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: /^Colar/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: /^Copiar/ })).not.toHaveAttribute('aria-disabled');
  });
  it('leaves the browser context menu available outside the desktop shell', async () => {
    menu(true, false);
    await act(() => {
      fireEvent.contextMenu(screen.getByTestId('editor-menu'));
    });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
