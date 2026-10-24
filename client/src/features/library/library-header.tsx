import { MapIcon, SearchIcon, XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { SegmentField, type SegmentOption } from '@/components/segment-field';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { VisibilityFilter } from '@/lib/folder-tree';

const VISIBILITY_OPTIONS: readonly SegmentOption<VisibilityFilter>[] = [
  { value: 'all', label: 'Todos' },
  { value: 'public', label: 'Públicos' },
  { value: 'private', label: 'Privados' },
];

/** The search and the filter; the filter only for the master (a player sees public grids). */
export type LibraryControls = Readonly<{
  query: string;
  onQuery: (query: string) => void;
  visibility: VisibilityFilter | null;
  onVisibility: (visibility: VisibilityFilter) => void;
}>;

export type LibraryHeaderProps = Readonly<{
  /** "Os Sinos de Vharn · 4 grids", or the table name while loading. */
  subtitle: string;
  onClose: () => void;
  controls?: LibraryControls;
  /** "Novo grid", for the master. */
  actions?: ReactNode;
}>;

/** The top of the library: title, table and count, search, filter, actions and close.
 *
 *  Example: `<LibraryHeader subtitle="Os Sinos de Vharn · 4 grids" onClose={close} controls={controls} />` */
export function LibraryHeader({ subtitle, onClose, controls, actions }: LibraryHeaderProps) {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-3.5 border-b border-border py-4 pr-4 pl-6">
      <MapIcon aria-hidden="true" className="size-5 text-primary" />
      <div className="mr-2 flex flex-col gap-0.5">
        <DialogTitle className="text-[26px]">Biblioteca de grids</DialogTitle>
        <DialogDescription className="text-xs">{subtitle}</DialogDescription>
      </div>
      {controls && <SearchAndFilter controls={controls} />}
      <span className="flex-1" />
      {actions}
      <Button variant="ghost" size="icon" aria-label="Fechar biblioteca" onClick={onClose}>
        <XIcon aria-hidden="true" />
      </Button>
    </header>
  );
}

function SearchAndFilter({ controls }: Readonly<{ controls: LibraryControls }>) {
  return (
    <>
      <div className="relative max-w-[340px] min-w-[200px] flex-1">
        <SearchIcon
          aria-hidden="true"
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-placeholder"
        />
        <Input
          type="search"
          aria-label="Buscar grid"
          placeholder="Buscar grid…"
          value={controls.query}
          onChange={(event) => controls.onQuery(event.target.value)}
          className="h-10 pl-9 text-sm"
        />
      </div>
      {controls.visibility && (
        <SegmentField
          legend="Visibilidade"
          compact
          value={controls.visibility}
          options={VISIBILITY_OPTIONS}
          onChange={controls.onVisibility}
        />
      )}
    </>
  );
}
