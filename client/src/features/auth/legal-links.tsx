import { LegalDocumentLink } from '@/components/legal-document-link';

const LINK_CLASS = 'text-muted-foreground hover:text-primary';

/** "Termos de uso · Política de privacidade", small and muted at the foot of the screens before
 *  the app.
 *
 *  Example: `<LegalLinks />` */
export function LegalLinks(): React.JSX.Element {
  return (
    <nav
      aria-label="Documentos legais"
      className="flex items-center gap-2 text-xs text-placeholder"
    >
      <LegalDocumentLink document="terms" className={LINK_CLASS} />
      <span aria-hidden="true">·</span>
      <LegalDocumentLink document="privacy" className={LINK_CLASS} />
    </nav>
  );
}
