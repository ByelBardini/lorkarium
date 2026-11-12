import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import type { DocumentContentDto } from '@lorkarium/contracts';
import DocumentEditor from '@/rich-text-editor/document-editor';
import { StrictMode, useState } from 'react';

// jsdom's Range has no layout, and ProseMirror scrolls the selection into view on focus.
function giveRangesAnEmptyLayout(): void {
  Object.assign(Range.prototype, {
    getClientRects: () => [],
    getBoundingClientRect: () => new DOMRect(),
  });
}

describe('DocumentEditor', () => {
  afterEach(() => {
    const range = Range.prototype as Partial<Range>;
    delete range.getClientRects;
    delete range.getBoundingClientRect;
  });
  it('keeps the editor mounted through StrictMode effect reconnection', async () => {
    render(
      <StrictMode>
        <DocumentEditor
          content={{
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Carta estável' }] }],
          }}
          editable
        />
      </StrictMode>,
    );
    expect(await screen.findByRole('textbox', { name: 'Conteúdo do documento' })).toHaveTextContent(
      'Carta estável',
    );
  });
  it('shows editable content and formatting controls for an editor', async () => {
    render(
      <DocumentEditor
        content={{
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Carta do rei' }] }],
        }}
        editable
      />,
    );
    expect(await screen.findByRole('textbox', { name: 'Conteúdo do documento' })).toHaveTextContent(
      'Carta do rei',
    );
    expect(screen.getByRole('toolbar', { name: 'Formatação do documento' })).toBeInTheDocument();
  });
  it('offers the line height on the toolbar, starting at the compact 1,15', async () => {
    giveRangesAnEmptyLayout();
    const changes: DocumentContentDto[] = [];
    render(
      <DocumentEditor
        content={{
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Carta do rei' }] }],
        }}
        editable
        onChange={(content) => changes.push(content)}
      />,
    );
    const lineHeight = await screen.findByRole('button', { name: 'Entrelinha' });
    expect(lineHeight).toHaveTextContent('1,15');
    await userEvent.click(lineHeight);
    await userEvent.click(await screen.findByRole('menuitemradio', { name: '2' }));
    expect(changes.at(-1)?.content[0]?.attrs).toEqual({ lineHeight: 2 });
  });
  it('aligns the block from the menu inside "Opções de parágrafo"', async () => {
    giveRangesAnEmptyLayout();
    const changes: DocumentContentDto[] = [];
    render(
      <DocumentEditor
        content={{
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Carta do rei' }] }],
        }}
        editable
        onChange={(content) => changes.push(content)}
      />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Opções de parágrafo' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Alinhamento' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Centralizado' }));
    expect(changes.at(-1)?.content[0]?.attrs).toEqual({ textAlign: 'center' });
  });
  it('shows the same text without editing controls for a reader', async () => {
    render(
      <DocumentEditor
        content={{
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Carta do rei' }] }],
        }}
        editable={false}
      />,
    );
    expect(await screen.findByText('Carta do rei')).toBeInTheDocument();
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

function paragraph(text: string): DocumentContentDto {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

// The panel's loop: what the editor emits comes back to it as its content.
function EditorOverDraft({ start }: Readonly<{ start: DocumentContentDto }>): React.JSX.Element {
  const [content, setContent] = useState(start);
  return <DocumentEditor content={content} editable onChange={setContent} />;
}

describe('DocumentEditor serializes once per key', () => {
  afterEach(() => vi.restoreAllMocks());

  it('a key typed reads the editor JSON once, even when the draft comes back as its content', async () => {
    giveRangesAnEmptyLayout();
    render(<EditorOverDraft start={paragraph('Carta')} />);
    const body = await screen.findByRole('textbox', { name: 'Conteúdo do documento' });
    // A click asks jsdom for `elementFromPoint`, which it lacks: focus puts the caret instead.
    act(() => body.focus());
    const serializations = vi.spyOn(Editor.prototype, 'getJSON');

    await userEvent.keyboard('X');

    expect(body).toHaveTextContent('X');
    expect(serializations).toHaveBeenCalledTimes(1);
  });

  it('content from outside (another person saved the tab) replaces the text', async () => {
    const view = render(<DocumentEditor content={paragraph('Carta')} editable />);
    const body = await screen.findByRole('textbox', { name: 'Conteúdo do documento' });

    view.rerender(<DocumentEditor content={paragraph('Carta do rei')} editable />);

    expect(body).toHaveTextContent('Carta do rei');
  });
});
