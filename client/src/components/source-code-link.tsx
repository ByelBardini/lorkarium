import { SOURCE_CODE_URL } from '@/lib/source-code';

export type SourceCodeLinkProps = Readonly<
  Omit<React.ComponentProps<'a'>, 'href' | 'target' | 'rel'>
>;

/** "Código-fonte" in a new tab (the default browser, in the desktop app): the AGPL offer of the
 *  source. Other props reach the `<a>` (a menu item's `asChild`).
 *
 *  Example: `<SourceCodeLink className="text-muted-foreground" />` */
export function SourceCodeLink({ children, ...anchor }: SourceCodeLinkProps): React.JSX.Element {
  return (
    <a {...anchor} href={SOURCE_CODE_URL} target="_blank" rel="noopener noreferrer">
      {children ?? 'Código-fonte'}
    </a>
  );
}
