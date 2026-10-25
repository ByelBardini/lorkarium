import type { LegalDocument } from '@lorkarium/contracts';

export const LEGAL_DOCUMENT_TITLES: Readonly<Record<LegalDocument, string>> = {
  terms: 'Termos de uso',
  privacy: 'Política de privacidade',
};

/** Where a legal text opens. Same origin on purpose: the server redirects to the landing
 *  (`SITE_PUBLIC_URL`), an address the client build never carries.
 *
 *  Example: `legalDocumentHref('terms') // '/api/legal/terms'` */
export function legalDocumentHref(document: LegalDocument): string {
  return `/api/legal/${document}`;
}
