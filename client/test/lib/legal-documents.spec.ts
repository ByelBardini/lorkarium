import { describe, expect, it } from 'vitest';
import { LEGAL_DOCUMENT_TITLES, legalDocumentHref } from '@/lib/legal-documents';

describe('legalDocumentHref', () => {
  it.each([
    ['terms', '/api/legal/terms'],
    ['privacy', '/api/legal/privacy'],
  ] as const)('%s opens at %s, on the app origin', (document, href) => {
    expect(legalDocumentHref(document)).toBe(href);
  });
});

describe('LEGAL_DOCUMENT_TITLES', () => {
  it('names the two texts as the landing titles them', () => {
    expect(LEGAL_DOCUMENT_TITLES).toEqual({
      terms: 'Termos de uso',
      privacy: 'Política de privacidade',
    });
  });
});
