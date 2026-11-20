import { describe, expect, it } from 'vitest';
import { LEGAL_DOCUMENT_TITLES, legalDocumentHref } from '@/lib/legal-documents';

describe('legalDocumentHref', () => {
  it.each([
    ['terms', '/api/legal/terms'],
    ['privacy', '/api/legal/privacy'],
    ['acceptable-use', '/api/legal/acceptable-use'],
  ] as const)('%s opens at %s, on the app origin', (document, href) => {
    expect(legalDocumentHref(document)).toBe(href);
  });
});

describe('LEGAL_DOCUMENT_TITLES', () => {
  it('names the three texts as the landing titles them', () => {
    expect(LEGAL_DOCUMENT_TITLES).toEqual({
      terms: 'Termos de uso',
      privacy: 'Política de privacidade',
      'acceptable-use': 'Política de uso',
    });
  });
});
