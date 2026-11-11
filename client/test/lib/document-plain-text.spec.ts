import type { DocumentNodeDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { documentPlainText } from '@/lib/document-plain-text';

const text = (value: string): DocumentNodeDto => ({ type: 'text', text: value });
const paragraph = (...content: DocumentNodeDto[]): DocumentNodeDto => ({
  type: 'paragraph',
  ...(content.length > 0 ? { content } : {}),
});
const node = (type: string, ...content: DocumentNodeDto[]): DocumentNodeDto => ({ type, content });
const plainOf = (...content: DocumentNodeDto[]): string =>
  documentPlainText({ type: 'doc', content });

describe('documentPlainText', () => {
  it('joins the text runs of a paragraph, marks or not', () =>
    expect(
      plainOf(paragraph(text('Goblin '), { ...text('feroz'), marks: [{ type: 'bold' }] })),
    ).toBe('Goblin feroz'));
  it('puts each paragraph and heading on its own line', () =>
    expect(plainOf(node('heading', text('Goblin')), paragraph(text('PV 7')))).toBe('Goblin\nPV 7'));
  it('keeps an empty paragraph as an empty line', () =>
    expect(plainOf(paragraph(text('A')), paragraph(), paragraph(text('B')))).toBe('A\n\nB'));
  it('turns a hard break into a line break', () =>
    expect(plainOf(paragraph(text('A'), { type: 'hardBreak' }, text('B')))).toBe('A\nB'));
  it('gives one line per list item, nested lists too', () => {
    const inner = node('bulletList', node('listItem', paragraph(text('B1'))));
    const list = node(
      'orderedList',
      node('listItem', paragraph(text('A')), inner),
      node('listItem', paragraph(text('C'))),
    );
    expect(plainOf(list)).toBe('A\nB1\nC');
  });
  it('reads a blockquote as its paragraphs', () =>
    expect(plainOf(node('blockquote', paragraph(text('Dito'))))).toBe('Dito'));
  it('gives a table row per line with its cells split by a tab', () => {
    const row = (...cells: string[]) =>
      node('tableRow', ...cells.map((cell) => node('tableCell', paragraph(text(cell)))));
    const table = node('table', row('Nome', 'PV'), row('Goblin', '7'));
    expect(plainOf(table)).toBe('Nome\tPV\nGoblin\t7');
  });
  it('gives nothing for an image or a rule', () =>
    expect(
      plainOf(
        paragraph(text('A')),
        { type: 'image', attrs: { assetId: '00000000-0000-4000-8000-000000000001' } },
        { type: 'horizontalRule' },
        paragraph(text('B')),
      ),
    ).toBe('A\nB'));
});
