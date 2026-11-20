import { LegalDocumentLink } from '@/components/legal-document-link';
import { SourceCodeLink } from '@/components/source-code-link';

const LINK_CLASS = 'text-muted-foreground hover:text-primary';

/** "Termos de uso · Política de privacidade · Política de uso · Código-fonte", small and muted at the foot of the screens before
 *  the app.
 *
 *  Example: `<LegalLinks />` */
export function LegalLinks(): React.JSX.Element {
  return (
    <nav
      aria-label="Documentos legais"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-placeholder"
    >
      <LegalDocumentLink document="terms" className={LINK_CLASS} />
      <span aria-hidden="true">·</span>
      <LegalDocumentLink document="privacy" className={LINK_CLASS} />
      <span aria-hidden="true">·</span>
      <LegalDocumentLink document="acceptable-use" className={LINK_CLASS} />
      <span aria-hidden="true">·</span>
      <SourceCodeLink className={LINK_CLASS} />
    </nav>
  );
}
