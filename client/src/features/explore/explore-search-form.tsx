import { SearchIcon, SlidersHorizontalIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { activeFilterCount, EMPTY_EXPLORE_SEARCH, type ExploreSearch } from './explore-filters';
import { ExploreFilterFields } from './explore-filter-fields';

export type ExploreSearchFormProps = Readonly<{
  /** The search the list shows now; the form starts from it. */
  applied: ExploreSearch;
  onSearch: (search: ExploreSearch) => void;
  readerIsAdmin: boolean;
}>;

/** The search of "Explorar mesas": the text, a "Filtros" panel and "Pesquisar". Nothing reaches
 *  the list until "Pesquisar" (or Enter), so the filters are part of the search, not live toggles.
 *
 *  Example: `<ExploreSearchForm applied={search} onSearch={setSearch} readerIsAdmin={false} />` */
export function ExploreSearchForm(props: ExploreSearchFormProps): React.JSX.Element {
  const [draft, setDraft] = useState<ExploreSearch>(props.applied);
  const [panelOpen, setPanelOpen] = useState(false);
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setPanelOpen(false);
    props.onSearch(draft);
  };
  return (
    <form role="search" onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <SearchIcon
          aria-hidden="true"
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-placeholder"
        />
        <Input
          type="search"
          aria-label="Buscar mesa pública"
          placeholder="Nome da mesa ou @ do mestre"
          value={draft.query}
          onChange={(event) => setDraft({ ...draft, query: event.target.value })}
          className="h-10 pl-9 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <Popover open={panelOpen} onOpenChange={setPanelOpen}>
          <FiltersTrigger count={activeFilterCount(draft)} />
          <PopoverContent align="end" className="flex w-80 flex-col">
            <ExploreFilterFields
              search={draft}
              onSearch={setDraft}
              readerIsAdmin={props.readerIsAdmin}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-3 self-start"
              onClick={() => setDraft({ ...EMPTY_EXPLORE_SEARCH, query: draft.query })}
            >
              Limpar filtros
            </Button>
          </PopoverContent>
        </Popover>
        <Button type="submit" className="h-10 flex-1 sm:flex-none">
          Pesquisar
        </Button>
      </div>
    </form>
  );
}

function FiltersTrigger({ count }: Readonly<{ count: number }>): React.JSX.Element {
  return (
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" className="h-10">
        <SlidersHorizontalIcon aria-hidden="true" />
        Filtros
        {count > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">
            {count}
          </span>
        )}
      </Button>
    </PopoverTrigger>
  );
}
