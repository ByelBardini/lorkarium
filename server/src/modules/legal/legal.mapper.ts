import type { LegalDocument } from '@lorkarium/contracts';

// The pages of `site/src/pages/{termos,privacidade}.astro`; they never move (the texts cite them).
const LANDING_PATH: Readonly<Record<LegalDocument, string>> = {
  terms: '/termos/',
  privacy: '/privacidade/',
};

/** The landing page of a legal text, under the landing address (no trailing slash).
 *
 *  Example: `landingPageUrlOf('https://example.com', 'terms') // 'https://example.com/termos/'` */
export function landingPageUrlOf(sitePublicUrl: string, document: LegalDocument): string {
  return `${sitePublicUrl}${LANDING_PATH[document]}`;
}
