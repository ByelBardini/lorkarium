import { ChevronDownIcon, MapIcon, SearchIcon, XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { LibraryTypeFilter } from '@/lib/library-entries';
import type { VisibilityFilter } from '@/lib/folder-tree';

/** The search and the filter; the filter only for the master (a player sees public grids). */
export type LibraryControls = Readonly<{
  query: string;
  type?: LibraryTypeFilter;
  onType?: (type: LibraryTypeFilter) => void;
  /** "Modelos de ficha" among the types: the master only. */
  sheetTemplates?: boolean;
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
    <header className="relative flex shrink-0 flex-wrap items-center gap-4 border-b border-border py-4 pr-16 pl-6">
      <MapIcon aria-hidden="true" className="size-5 text-primary" />
      <div className="mr-2 flex min-w-0 flex-col gap-0.5">
        <DialogTitle className="text-[26px]">Biblioteca</DialogTitle>
        <DialogDescription className="text-xs">{subtitle}</DialogDescription>
      </div>
      {controls && <SearchAndFilter controls={controls} />}
      <span className="flex-1" />
      {actions}
      <Button
        className="absolute top-4 right-4 lg:top-1/2 lg:-translate-y-1/2"
        variant="ghost"
        size="icon"
        aria-label="Fechar biblioteca"
        onClick={onClose}
      >
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
          aria-label="Buscar item"
          placeholder="Buscar item…"
          value={controls.query}
          onChange={(event) => controls.onQuery(event.target.value)}
          className="h-10 pl-9 text-sm"
        />
      </div>
      {controls.onType && (
        <FilterSelect
          label="Tipo de item"
          value={controls.type ?? 'all'}
          onChange={(value) => controls.onType?.(value as LibraryTypeFilter)}
        >
          <option value="all">Todos os tipos</option>
          <option value="grid">Grids</option>
          <option value="image">Imagens</option>
          <option value="document">Documentos</option>
          {controls.sheetTemplates && <option value="sheet-template">Modelos de ficha</option>}
          <option value="sheet">Fichas</option>
        </FilterSelect>
      )}
      {controls.visibility && (
        <FilterSelect
          label="Visibilidade"
          value={controls.visibility}
          onChange={(value) => controls.onVisibility(value as VisibilityFilter)}
        >
          <option value="all">Toda visibilidade</option>
          <option value="public">Públicos</option>
          <option value="private">Privados</option>
        </FilterSelect>
      )}
    </>
  );
}

type FilterSelectProps = Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}>;

// Chromium paints the native arrow button white on hover, outside the dark theme: own chevron.
function FilterSelect({ label, value, onChange, children }: FilterSelectProps) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        className="h-10 cursor-pointer appearance-none rounded-md border border-input bg-card pr-9 pl-3 text-sm text-foreground hover:bg-muted"
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}
