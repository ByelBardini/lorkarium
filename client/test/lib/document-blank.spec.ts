import { EMPTY_DOCUMENT_CONTENT } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { isBlankDocumentContent } from '@/lib/document-blank';
import { documentText } from '../support/documents-fixtures';

describe('blank tab body', () => {
  it('an empty paragraph, with or without a content list, has nothing to lose', () => {
    expect(isBlankDocumentContent(EMPTY_DOCUMENT_CONTENT)).toBe(true);
    expect(isBlankDocumentContent(documentText(''))).toBe(true);
  });
  it('a paragraph with text is something to lose', () => {
    expect(isBlankDocumentContent(documentText('Espada'))).toBe(false);
  });
  it('a separator alone is something to lose', () => {
    expect(isBlankDocumentContent({ type: 'doc', content: [{ type: 'horizontalRule' }] })).toBe(
      false,
    );
  });
});
