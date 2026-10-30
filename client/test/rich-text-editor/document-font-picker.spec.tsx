import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { DocumentContentDto } from '@lorkarium/contracts';
import DocumentEditor from '@/rich-text-editor/document-editor';

// jsdom's Range has no layout, and ProseMirror scrolls the selection into view on focus.
function giveRangesAnEmptyLayout(): void {
  Object.assign(Range.prototype, {
    getClientRects: () => [],
    getBoundingClientRect: () => new DOMRect(),
  });
}

describe('DocumentFontPicker', () => {
  afterEach(() => {
    const range = Range.prototype as Partial<Range>;
    delete range.getClientRects;
    delete range.getBoundingClientRect;
  });

  async function selectedLetter(changes: DocumentContentDto[]): Promise<void> {
    giveRangesAnEmptyLayout();
    render(
      <DocumentEditor
        content={{
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Carta' }] }],
        }}
        editable
        onChange={(content) => changes.push(content)}
      />,
    );
    const body = await screen.findByRole('textbox', { name: 'Conteúdo do documento' });
    act(() => body.focus());
    await userEvent.keyboard('{Control>}a{/Control}');
  }
  const marksOf = (changes: DocumentContentDto[]): unknown =>
    changes.at(-1)?.content[0]?.content?.[0]?.marks;

  it('previews each font in itself but the symbol ones, and applies the one chosen', async () => {
    const changes: DocumentContentDto[] = [];
    await selectedLetter(changes);
    await userEvent.click(screen.getByRole('button', { name: 'Fonte' }));
    expect(screen.getByRole('menuitemradio', { name: 'Georgia' }).style.fontFamily).toBe(
      'Georgia, serif',
    );
    expect(screen.getByRole('menuitemradio', { name: 'Wingdings' }).style.fontFamily).toBe('');
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Georgia' }));
    expect(marksOf(changes)).toEqual([{ type: 'textStyle', attrs: { fontFamily: 'Georgia' } }]);
    expect(screen.getByRole('button', { name: 'Fonte' })).toHaveTextContent('Georgia');
  });
  it('"Fonte padrão" takes the font off again', async () => {
    const changes: DocumentContentDto[] = [];
    await selectedLetter(changes);
    await userEvent.click(screen.getByRole('button', { name: 'Fonte' }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Arial' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fonte' }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Fonte padrão' }));
    expect(marksOf(changes)).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Fonte' })).toHaveTextContent('Fonte padrão');
  });
});
