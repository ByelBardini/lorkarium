import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { documentExtensions } from '@/rich-text-editor/document-extensions';
import { documentContentFromEditor } from '@/rich-text-editor/document-content-adapter';

const editors: Editor[] = [];
function editingLetter(): Editor {
  const editor = new Editor({
    extensions: documentExtensions((id) => `/api/assets/${id}`),
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Carta do rei' }] }],
    },
  });
  editors.push(editor);
  return editor;
}
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()));

describe('documentExtensions', () => {
  it('formats only selected text with the supported font size color and bold', () => {
    const editor = editingLetter();
    editor
      .chain()
      .setTextSelection({ from: 1, to: 6 })
      .setFontFamily('JetBrains Mono')
      .setFontSize('24px')
      .setColor('#b5654f')
      .toggleBold()
      .run();
    const content = documentContentFromEditor(editor.getJSON());
    expect(content.content[0]?.content).toEqual([
      {
        type: 'text',
        text: 'Carta',
        marks: [
          {
            type: 'textStyle',
            attrs: { fontFamily: 'JetBrains Mono', fontSize: '24px', color: '#b5654f' },
          },
          { type: 'bold' },
        ],
      },
      { type: 'text', text: ' do rei' },
    ]);
  });
  it('keeps paragraph alignment indent and line height through serialization', () => {
    const editor = editingLetter();
    editor
      .chain()
      .setTextAlign('center')
      .updateAttributes('paragraph', { indent: 2, lineHeight: 2 })
      .run();
    expect(documentContentFromEditor(editor.getJSON()).content[0]?.attrs).toEqual({
      textAlign: 'center',
      indent: 2,
      lineHeight: 2,
    });
  });
  it('stores the font name and draws its stack, so the bundled font reaches its Variable family', () => {
    const editor = editingLetter();
    editor.chain().setTextSelection({ from: 1, to: 6 }).setFontFamily('Hanken Grotesk').run();
    expect(documentContentFromEditor(editor.getJSON()).content[0]?.content?.[0]?.marks).toEqual([
      { type: 'textStyle', attrs: { fontFamily: 'Hanken Grotesk' } },
    ]);
    expect(editor.view.dom.querySelector('span')?.style.fontFamily).toBe(
      '"Hanken Grotesk Variable", "Hanken Grotesk", sans-serif',
    );
  });
  it('keeps a pasted known font and drops an unknown one', () => {
    const editor = editingLetter();
    editor.commands.setContent(
      '<p><span style="font-family: Wingdings">A</span><span style="font-family: Papyrus">B</span></p>',
    );
    expect(documentContentFromEditor(editor.getJSON()).content[0]?.content).toEqual([
      {
        type: 'text',
        text: 'A',
        marks: [{ type: 'textStyle', attrs: { fontFamily: 'Wingdings' } }],
      },
      { type: 'text', text: 'B' },
    ]);
  });
  it('adds a third table row while preserving the first cell text', () => {
    const editor = editingLetter();
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'CA 18' }] }],
                },
                { type: 'tableCell', content: [{ type: 'paragraph' }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph' }] },
                { type: 'tableCell', content: [{ type: 'paragraph' }] },
              ],
            },
          ],
        },
      ],
    });
    editor.chain().setTextSelection(4).addRowAfter().run();
    const table = documentContentFromEditor(editor.getJSON()).content[0];
    expect(table?.content).toHaveLength(3);
    expect(table?.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe('CA 18');
  });
  it('undo and redo restore only the formatting change', () => {
    const editor = editingLetter();
    editor.chain().setTextSelection({ from: 1, to: 6 }).toggleBold().run();
    editor.commands.undo();
    expect(documentContentFromEditor(editor.getJSON()).content[0]?.content).toEqual([
      { type: 'text', text: 'Carta do rei' },
    ]);
    editor.commands.redo();
    expect(documentContentFromEditor(editor.getJSON()).content[0]?.content?.[0]?.marks).toEqual([
      { type: 'bold' },
    ]);
  });
  it('does not load remote images from pasted HTML or retain event attributes', () => {
    const editor = editingLetter();
    editor.commands.setContent(
      '<p onclick="alert(1)">Carta<img src="https://example.com/private.png" onerror="alert(1)"></p>',
    );
    expect(documentContentFromEditor(editor.getJSON())).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Carta' }] }],
    });
    expect(editor.view.dom.querySelector('img')).toBeNull();
  });
});
