import { z } from 'zod';

/** The version of the Terms of use and Privacy policy pair, recorded with each acceptance: the
 *  date of the newer `updatedAt` of `site/src/content/legal/{termos,privacidade}.md`. Either text
 *  changed → bump it with the `updatedAt`.
 *
 *  Example: `{ termsVersion: LEGAL_DOCUMENTS_VERSION } // '2026-10-25'` */
export const LEGAL_DOCUMENTS_VERSION = '2026-10-25';

/** The legal pages of the landing the app links to (`GET /api/legal/<document>` redirects there).
 *
 *  Example: `legalDocumentDto.options // ['terms', 'privacy']` */
export const legalDocumentDto = z.enum(['terms', 'privacy']);

export type LegalDocument = z.infer<typeof legalDocumentDto>;
