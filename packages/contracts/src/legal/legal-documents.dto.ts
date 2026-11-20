import { z } from 'zod';

/** The version of the three legal texts (Terms of use, Privacy policy and Acceptable use policy,
 *  which the terms incorporate), recorded with each acceptance: the date of the newest `updatedAt`
 *  of `site/src/content/legal/{termos,privacidade,uso}.md`. Any of them changed → bump it with the
 *  `updatedAt`.
 *
 *  Example: `{ termsVersion: LEGAL_DOCUMENTS_VERSION } // '2026-11-19'` */
export const LEGAL_DOCUMENTS_VERSION = '2026-11-19';

/** The legal pages of the landing the app links to (`GET /api/legal/<document>` redirects there).
 *
 *  Example: `legalDocumentDto.options // ['terms', 'privacy', 'acceptable-use']` */
export const legalDocumentDto = z.enum(['terms', 'privacy', 'acceptable-use']);

export type LegalDocument = z.infer<typeof legalDocumentDto>;
