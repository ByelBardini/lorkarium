import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { DocumentContentDto } from '@lorkarium/contracts';
import DocumentEditor from '@/rich-text-editor/document-editor';
import { typedFontSize } from '@/rich-text-editor/document-fonts';

// jsdom's Range has no layout, and ProseMirror scrolls the selection into view on focus.
function giveRangesAnEmptyLayout(): void {
  Object.assign(Range.prototype, {
    getClientRects: () => [],
    getBoundingClientRect: () => new DOMRect(),
  });
}

describe('typedFontSize', () => {
  it.each([
    ['13', 13],
    [' 8 ', 8],
    ['72', 72],
  ])('accepts %s', (text, size) => {
    expect(typedFontSize(text)).toBe(size);
  });
  it.each(['7', '73', '12.5', 'abc', ''])('refuses %s', (text) => {
    expect(typedFontSize(text)).toBeNull();
  });
});

describe('DocumentFontSize', () => {
  afterEach(() => {
    const range = Range.prototype as Partial<Range>;
    delete range.getClientRects;
    delete range.getBoundingClientRect;
  });

  function letter(changes: DocumentContentDto[]): void {
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
  }
  const fontSizeOf = (changes: DocumentContentDto[]): unknown =>
    changes.at(-1)?.content[0]?.content?.[0]?.marks;

  it('applies a typed size on Enter', async () => {
    const changes: DocumentContentDto[] = [];
    letter(changes);
    const field = await screen.findByRole('textbox', { name: 'Tamanho da fonte' });
    expect(field).toHaveValue('16');
    act(() => screen.getByRole('textbox', { name: 'Conteúdo do documento' }).focus());
    await userEvent.keyboard('{Control>}a{/Control}');
    await userEvent.click(screen.getByRole('button', { name: 'Fonte' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Arial' }));
    await userEvent.clear(field);
    await userEvent.type(field, '13{Enter}');
    expect(fontSizeOf(changes)).toEqual([
      { type: 'textStyle', attrs: { fontFamily: 'Arial', fontSize: '13px' } },
    ]);
  });
  it('gives back the current size when the typed one is out of range', async () => {
    const changes: DocumentContentDto[] = [];
    letter(changes);
    const field = await screen.findByRole('textbox', { name: 'Tamanho da fonte' });
    await userEvent.clear(field);
    await userEvent.type(field, '99{Enter}');
    expect(field).toHaveValue('16');
    expect(changes).toEqual([]);
  });
  it('applies a usual size picked from the list', async () => {
    const changes: DocumentContentDto[] = [];
    letter(changes);
    await userEvent.click(await screen.findByRole('button', { name: 'Tamanhos de fonte' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: '24' }));
    expect(screen.getByRole('textbox', { name: 'Tamanho da fonte' })).toHaveValue('24');
  });
});
