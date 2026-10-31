import { describe, expect, it } from 'vitest';
import { documentContentDto, documentLinkDto, EMPTY_DOCUMENT_CONTENT } from '../../src';

const assetId = '00000000-0000-4000-8000-000000000001';
const paragraph = { type: 'paragraph' };
const wrap = (node: unknown): unknown => ({ type: 'doc', content: [node] });
const cell = { type: 'tableCell', content: [paragraph] };

describe('document content safety', () => {
  it('preserves the canonical empty paragraph and an asset image without a remote src', () => {
    expect(documentContentDto.parse(EMPTY_DOCUMENT_CONTENT)).toEqual({
      type: 'doc',
      content: [paragraph],
    });
    expect(documentContentDto.parse(wrap({ type: 'image', attrs: { assetId } }))).toEqual(
      wrap({ type: 'image', attrs: { assetId } }),
    );
  });
  it.each(['Arial', 'Times New Roman', 'Wingdings'])('accepts the system font %s', (font) => {
    const styled = wrap({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'x', marks: [{ type: 'textStyle', attrs: { fontFamily: font } }] },
      ],
    });
    expect(documentContentDto.parse(styled)).toEqual(styled);
  });
  it('preserves approved formatting and a simple table', () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { indent: 2, lineHeight: 1.15, textAlign: 'center' },
          content: [
            {
              type: 'text',
              text: 'Carta',
              marks: [
                {
                  type: 'textStyle',
                  attrs: { fontFamily: 'Cormorant Garamond', fontSize: '24px', color: '#aabbcc' },
                },
              ],
            },
          ],
        },
        { type: 'table', content: [{ type: 'tableRow', content: [cell, cell] }] },
      ],
    };
    expect(documentContentDto.parse(content)).toEqual(content);
  });
  it.each([
    { type: 'image', attrs: { assetId, src: 'https://tracking.test/image' } },
    { type: 'paragraph', content: [{ type: 'table', content: [] }] },
    { type: 'text', text: 'unwrapped' },
    { type: 'heading', attrs: { level: 4 } },
    { type: 'paragraph', attrs: { onload: 'alert(1)' } },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'x',
          marks: [{ type: 'textStyle', attrs: { fontFamily: 'Papyrus' } }],
        },
      ],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'x',
          marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
        },
      ],
    },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [{ type: 'tableCell', attrs: { colspan: 2 }, content: [paragraph] }],
        },
      ],
    },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              content: [{ type: 'table', content: [{ type: 'tableRow', content: [cell] }] }],
            },
          ],
        },
      ],
    },
  ])('refuses unsupported node structure or attributes %j', (node) => {
    expect(documentContentDto.safeParse(wrap(node)).success).toBe(false);
  });
  it('accepts depth sixteen and refuses depth seventeen before recursive parsing', () => {
    let branch: unknown = paragraph;
    for (let depth = 0; depth < 14; depth++) branch = { type: 'blockquote', content: [branch] };
    expect(documentContentDto.safeParse(wrap(branch)).success).toBe(true);
    expect(
      documentContentDto.safeParse(wrap({ type: 'blockquote', content: [branch] })).success,
    ).toBe(false);
  });
  it('accepts exactly 100000 text characters and refuses one more', () => {
    const text = (count: number): unknown =>
      wrap({ type: 'paragraph', content: [{ type: 'text', text: 'a'.repeat(count) }] });
    expect(documentContentDto.safeParse(text(100_000)).success).toBe(true);
    expect(documentContentDto.safeParse(text(100_001)).success).toBe(false);
  });
  it('accepts 10000 nodes and refuses one more', () => {
    expect(
      documentContentDto.safeParse({
        type: 'doc',
        content: Array.from({ length: 9999 }, () => paragraph),
      }).success,
    ).toBe(true);
    expect(
      documentContentDto.safeParse({
        type: 'doc',
        content: Array.from({ length: 10000 }, () => paragraph),
      }).success,
    ).toBe(false);
  });
  it('accepts fifty image occurrences and refuses fifty one', () => {
    const images = (count: number): unknown => ({
      type: 'doc',
      content: Array.from({ length: count }, () => ({ type: 'image', attrs: { assetId } })),
    });
    expect(documentContentDto.safeParse(images(50)).success).toBe(true);
    expect(documentContentDto.safeParse(images(51)).success).toBe(false);
  });
  it('accepts exactly 512 KiB of JSON and refuses one extra byte', () => {
    const node = {
      type: 'text',
      text: 'x',
      marks: Array.from({ length: 30_000 }, () => ({ type: 'bold' })),
    };
    const tree = { type: 'doc', content: [{ type: 'paragraph', content: [node] }] };
    node.text += 'x'.repeat(512 * 1024 - JSON.stringify(tree).length);
    expect(documentContentDto.safeParse(tree).success).toBe(true);
    node.text += 'x';
    expect(documentContentDto.safeParse(tree).success).toBe(false);
  });
  it('limits tables to one hundred rows and twenty columns', () => {
    const table = (rows: number, columns: number): unknown =>
      wrap({
        type: 'table',
        content: Array.from({ length: rows }, () => ({
          type: 'tableRow',
          content: Array.from({ length: columns }, () => cell),
        })),
      });
    expect(documentContentDto.safeParse(table(100, 20)).success).toBe(true);
    expect(documentContentDto.safeParse(table(101, 20)).success).toBe(false);
    expect(documentContentDto.safeParse(table(100, 21)).success).toBe(false);
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,test',
    'https://name:password@example.test',
    'https://name@example.test',
  ])('refuses unsafe link %s', (href) =>
    expect(documentLinkDto.safeParse(href).success).toBe(false),
  );
  it('normalizes surrounding spaces and accepts mailto links', () => {
    expect(documentLinkDto.parse(' https://example.test/path ')).toBe('https://example.test/path');
    expect(documentLinkDto.parse('mailto:hero@example.test')).toBe('mailto:hero@example.test');
  });
});
