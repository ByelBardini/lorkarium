// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { captureDocumentSelection } from '@/rich-text-editor/document-selection';
import { documentExtensions } from '@/rich-text-editor/document-extensions';

const editors: Editor[] = [];
afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
  document.body.replaceChildren();
});
describe('document toolbar selection capture', () => {
  it('synchronizes the latest native selection before formatting instead of using the previous caret', () => {
    const element = document.createElement('div');
    document.body.append(element);
    const editor = new Editor({
      element,
      extensions: documentExtensions((id) => id),
      content: '<p>Carta secreta</p>',
    });
    editors.push(editor);
    editor.commands.setTextSelection(14);
    const text = editor.view.dom.querySelector('p')?.firstChild;
    if (!text) throw new Error('Expected text node for letter');
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 5);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    captureDocumentSelection(editor);
    editor.commands.toggleBold();
    expect(editor.getJSON().content?.[0]?.content).toEqual([
      { type: 'text', marks: [{ type: 'bold' }], text: 'Carta' },
      { type: 'text', text: ' secreta' },
    ]);
  });
  it('ignores a native selection in another document control', () => {
    const editor = new Editor({
      extensions: documentExtensions((id) => id),
      content: '<p>Carta secreta</p>',
    });
    editors.push(editor);
    editor.commands.setTextSelection({ from: 1, to: 6 });
    const outside = document.createElement('p');
    outside.textContent = 'Outro';
    document.body.append(outside);
    const range = document.createRange();
    range.selectNodeContents(outside);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    captureDocumentSelection(editor);
    expect(editor.state.selection.toJSON()).toMatchObject({ anchor: 1, head: 6 });
  });
});
