import { describe, expect, it } from 'vitest';
import { DOCUMENT_FONTS } from '@lorkarium/contracts';
import { documentFontOf, documentFontStack } from '@/rich-text-editor/document-fonts';

describe('documentFontStack', () => {
  it('points a bundled font at its fontsource family first', () => {
    expect(documentFontStack('Cormorant Garamond')).toMatch(/^'Cormorant Garamond Variable'/);
  });
  it('gives every font of the contract a stack that reads back as the same font', () => {
    for (const font of DOCUMENT_FONTS) expect(documentFontOf(documentFontStack(font))).toBe(font);
  });
});

describe('documentFontOf', () => {
  it.each([
    ['"Times New Roman", serif', 'Times New Roman'],
    ["'JetBrains Mono Variable', monospace", 'JetBrains Mono'],
    ['wingdings', 'Wingdings'],
  ])('reads %s as %s', (css, font) => {
    expect(documentFontOf(css)).toBe(font);
  });
  it('is null for a font outside the list', () => {
    expect(documentFontOf('Papyrus, fantasy')).toBeNull();
  });
});
