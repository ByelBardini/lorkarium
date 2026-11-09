import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Editor, type JSONContent } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { documentExtensions } from '@/rich-text-editor/document-extensions';
import { DocumentToolbar } from '@/rich-text-editor/document-toolbar';
import { documentContentFromEditor } from '@/rich-text-editor/document-content-adapter';
import { applyTypedCustomColor } from '../support/pick-custom-color';

// jsdom's Range has no layout, and ProseMirror scrolls the selection into view on focus.
function giveRangesAnEmptyLayout(): void {
  Object.assign(Range.prototype, {
    getClientRects: () => [],
    getBoundingClientRect: () => new DOMRect(),
  });
}

function letterEditor(content?: JSONContent): Editor {
  const editor = new Editor({
    element: document.body.appendChild(document.createElement('div')),
    extensions: documentExtensions((assetId) => `/api/assets/${assetId}`),
    content: content ?? {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Carta do rei' }] }],
    },
  });
  editor.commands.selectAll();
  return editor;
}

function textColorOf(editor: Editor): unknown {
  return editor.getAttributes('textStyle').color;
}

async function openTextColor(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Opções de cor do texto' }));
  await screen.findByLabelText('Código da cor');
}

describe('DocumentToolbar, the text color', () => {
  let editor: Editor;

  beforeEach(() => {
    giveRangesAnEmptyLayout();
    editor = letterEditor();
    render(<DocumentToolbar editor={editor} />);
  });

  afterEach(() => {
    editor.destroy();
    const range = Range.prototype as Partial<Range>;
    delete range.getClientRects;
    delete range.getBoundingClientRect;
  });

  it('has no native color input left', async () => {
    await openTextColor();

    expect(document.querySelector('input[type="color"]')).toBeNull();
  });

  it('starts the preview on the color of the selection', async () => {
    editor.chain().setColor('#336699').run();

    await openTextColor();

    expect(screen.getByLabelText('Código da cor')).toHaveValue('#336699');
  });

  it('starts the preview on the default ink when the selection has no color', async () => {
    await openTextColor();

    expect(screen.getByLabelText('Código da cor')).toHaveValue('#eae5da');
  });

  it('"Usar cor" colors the selection and closes the popover', async () => {
    await openTextColor();

    await applyTypedCustomColor('#336699');

    expect(textColorOf(editor)).toBe('#336699');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Usar cor' })).not.toBeInTheDocument(),
    );
  });

  it('typing a color changes nothing before "Usar cor"', async () => {
    await openTextColor();

    await userEvent.clear(screen.getByLabelText('Código da cor'));
    await userEvent.type(screen.getByLabelText('Código da cor'), '#336699');

    expect(textColorOf(editor)).toBeUndefined();
  });

  it('"Cor padrão" still takes the color away', async () => {
    editor.chain().setColor('#336699').run();
    await openTextColor();

    await userEvent.click(screen.getByRole('button', { name: 'Cor padrão' }));

    expect(textColorOf(editor)).toBeUndefined();
  });

  it('after "Usar cor" the focus is back on the editor', async () => {
    await openTextColor();

    await applyTypedCustomColor('#336699');

    await waitFor(() => expect(editor.view.dom).toHaveFocus());
  });

  it('Esc discards the preview and gives the focus back to the editor', async () => {
    await openTextColor();
    await userEvent.clear(screen.getByLabelText('Código da cor'));
    await userEvent.type(screen.getByLabelText('Código da cor'), '#336699');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(editor.view.dom).toHaveFocus());
    expect(textColorOf(editor)).toBeUndefined();
  });
});

describe('DocumentToolbar, the selected image', () => {
  let editor: Editor;
  const assetId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    giveRangesAnEmptyLayout();
    editor = letterEditor({
      type: 'doc',
      content: [
        { type: 'image', attrs: { assetId, alt: 'Primeira' } },
        { type: 'image', attrs: { assetId, alt: 'Segunda' } },
      ],
    });
    editor.commands.setNodeSelection(1);
    editor.view.focus();
    render(<DocumentToolbar editor={editor} />);
  });

  afterEach(() => {
    editor.destroy();
    const range = Range.prototype as Partial<Range>;
    delete range.getClientRects;
    delete range.getBoundingClientRect;
  });

  it('changes only the selected image and keeps its layout in the saved content', async () => {
    expect(screen.queryByRole('button', { name: 'Opções de parágrafo' })).not.toBeInTheDocument();
    const width = screen.getByRole('spinbutton', { name: 'Largura da imagem em pixels' });
    await userEvent.type(width, '240{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Alinhamento da imagem' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'À direita' }));

    expect(documentContentFromEditor(editor.getJSON()).content).toEqual([
      { type: 'image', attrs: { assetId, alt: 'Primeira' } },
      { type: 'image', attrs: { assetId, alt: 'Segunda', width: 240, align: 'right' } },
    ]);
    const image = screen.getByRole('img', { name: 'Segunda' });
    expect(image).toHaveStyle({ width: '240px' });
    expect(image.closest('.document-image')).toHaveAttribute('data-align', 'right');

    await userEvent.click(screen.getByRole('button', { name: 'Alinhamento da imagem' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Centralizado' }));
    expect(image.closest('.document-image')).toHaveAttribute('data-align', 'center');

    await userEvent.click(screen.getByRole('button', { name: 'Alinhamento da imagem' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'À esquerda' }));
    expect(documentContentFromEditor(editor.getJSON()).content[1]?.attrs?.align).toBe('left');
  });

  it('keeps the saved width for out-of-range input and accepts the original size', async () => {
    await userEvent.type(screen.getByRole('spinbutton'), '240{Enter}');
    const width = screen.getByRole('spinbutton');
    await userEvent.clear(width);
    await userEvent.type(width, '4097{Enter}');
    expect(documentContentFromEditor(editor.getJSON()).content[1]?.attrs?.width).toBe(240);

    await userEvent.clear(width);
    await userEvent.keyboard('{Enter}');
    expect(documentContentFromEditor(editor.getJSON()).content[1]?.attrs?.width).toBeUndefined();
  });
});
