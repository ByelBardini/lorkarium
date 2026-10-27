import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type ExplorePaginationProps = Readonly<{
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}>;

/** "Anterior · Página N de M · Próxima" under the grid; nothing when everything fits one page.
 *
 *  Example: `<ExplorePagination page={2} pageCount={3} onPage={setPage} />` */
export function ExplorePagination({
  page,
  pageCount,
  onPage,
}: ExplorePaginationProps): React.JSX.Element | null {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Páginas" className="flex items-center justify-center gap-3">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeftIcon aria-hidden="true" />
        Anterior
      </Button>
      <span className="text-sm text-muted-foreground tabular-nums">
        Página {page} de {pageCount}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= pageCount}
        onClick={() => onPage(page + 1)}
      >
        Próxima
        <ChevronRightIcon aria-hidden="true" />
      </Button>
    </nav>
  );
}
