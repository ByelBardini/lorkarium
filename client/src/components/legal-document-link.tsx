import type { LegalDocument } from '@lorkarium/contracts';
import { LEGAL_DOCUMENT_TITLES, legalDocumentHref } from '@/lib/legal-documents';

export type LegalDocumentLinkProps = Readonly<
  Omit<React.ComponentProps<'a'>, 'href' | 'target' | 'rel'> & { document: LegalDocument }
>;

/** A legal text of the landing in a new tab (the default browser, in the desktop app); the text
 *  is its title unless children say otherwise. Other props reach the `<a>` (a menu item's `asChild`).
 *
 *  Example: `<LegalDocumentLink document="privacy" />` */
export function LegalDocumentLink({
  document,
  children,
  ...anchor
}: LegalDocumentLinkProps): React.JSX.Element {
  return (
    <a {...anchor} href={legalDocumentHref(document)} target="_blank" rel="noopener noreferrer">
      {children ?? LEGAL_DOCUMENT_TITLES[document]}
    </a>
  );
}
