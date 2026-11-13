import { ListFilterIcon, SearchIcon, XIcon } from 'lucide-react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { SegmentField } from '@/components/segment-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { VisibilityFilter } from '@/lib/folder-tree';
import type { LibraryTypeFilter } from '@/lib/library-entries';
import { cn } from '@/lib/utils';

const TYPE_OPTIONS: readonly Readonly<{ value: LibraryTypeFilter; label: string }>[] = [
  { value: 'all', label: 'Tudo' },
  { value: 'grid', label: 'Grids' },
  { value: 'image', label: 'Imagens' },
  { value: 'map', label: 'Mapas' },
  { value: 'document', label: 'Documentos' },
  { value: 'sheet-template', label: 'Modelos de ficha' },
  { value: 'sheet', label: 'Fichas' },
];

const VISIBILITY_OPTIONS: readonly Readonly<{ value: VisibilityFilter; label: string }>[] = [
  { value: 'all', label: 'Toda' },
  { value: 'public', label: 'Públicos' },
  { value: 'private', label: 'Privados' },
];

/** The search and the filters; the visibility one only for the master (a player sees public items). */
export type LibraryControls = Readonly<{
  query: string;
  onQuery: (query: string) => void;
  type: LibraryTypeFilter;
  onType: (type: LibraryTypeFilter) => void;
  /** How many items of each type, said beside each type of the filter. */
  typeCounts: Readonly<Record<LibraryTypeFilter, number>>;
  /** "Modelos de ficha" among the types: the master only. */
  sheetTemplates: boolean;
  visibility: VisibilityFilter | null;
  onVisibility: (visibility: VisibilityFilter) => void;
}>;

/** The search across the drawer, with the filters (type, and the master's visibility) in a
 *  popover behind the button inside it; each filter on shows as a pill under the search,
 *  removed by its ×.
 *
 *  Example: `<LibrarySearch query="" onQuery={view.search} type="all" onType={view.filterType} … />` */
export function LibrarySearch(props: LibraryControls): React.JSX.Element {
  const active = props.type !== 'all' || (props.visibility ?? 'all') !== 'all';
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <SearchIcon
          aria-hidden="true"
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-placeholder"
        />
        <Input
          type="search"
          aria-label="Buscar item"
          placeholder="Buscar na biblioteca"
          value={props.query}
          onChange={(event) => props.onQuery(event.target.value)}
          className="h-9 pr-10 pl-9 text-sm"
        />
        <FiltersButton {...props} active={active} />
      </div>
      {active && <FilterPills {...props} />}
    </div>
  );
}

function FiltersButton(props: LibraryControls & Readonly<{ active: boolean }>) {
  return (
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Filtrar itens"
          className={cn(
            'absolute top-1/2 right-1 -translate-y-1/2',
            props.active && 'text-primary',
          )}
        >
          <ListFilterIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-3">
        <TypeOptions {...props} />
        {props.visibility !== null && (
          <div className="flex flex-col gap-1.5">
            <span aria-hidden="true" className="text-xs font-medium text-label">
              Visibilidade
            </span>
            <SegmentField
              legend="Visibilidade"
              value={props.visibility}
              options={VISIBILITY_OPTIONS}
              onChange={props.onVisibility}
              fill
              compact
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// One line per type, its count at the end; the arrows move the choice.
function TypeOptions({ type, onType, typeCounts, sheetTemplates }: LibraryControls) {
  const shown = TYPE_OPTIONS.filter(({ value }) => sheetTemplates || value !== 'sheet-template');
  return (
    <div className="flex flex-col gap-1.5">
      <span aria-hidden="true" className="text-xs font-medium text-label">
        Tipo
      </span>
      <RadioGroupPrimitive.Root
        aria-label="Tipo de item"
        value={type}
        onValueChange={(next) => {
          const chosen = shown.find(({ value }) => value === next);
          if (chosen) onType(chosen.value);
        }}
        className="flex flex-col"
      >
        {shown.map(({ value, label }) => (
          <RadioGroupPrimitive.Item
            key={value}
            value={value}
            aria-label={label}
            className="flex h-8 items-center justify-between rounded-md px-2 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-primary/12 data-[state=checked]:text-primary"
          >
            {label}
            <span aria-hidden="true" className="text-xs tabular-nums">
              {typeCounts[value]}
            </span>
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
    </div>
  );
}

function FilterPills({ type, onType, visibility, onVisibility }: LibraryControls) {
  const typeLabel = TYPE_OPTIONS.find(({ value }) => value === type)?.label ?? type;
  const shown = VISIBILITY_OPTIONS.find(({ value }) => value === visibility);
  return (
    <div className="flex flex-wrap gap-1.5">
      {type !== 'all' && <FilterPill label={typeLabel} onClear={() => onType('all')} />}
      {shown && shown.value !== 'all' && (
        <FilterPill label={shown.label} onClear={() => onVisibility('all')} />
      )}
    </div>
  );
}

function FilterPill({ label, onClear }: Readonly<{ label: string; onClear: () => void }>) {
  return (
    <button
      type="button"
      aria-label={`Tirar o filtro ${label}`}
      onClick={onClear}
      className="inline-flex h-6.5 items-center gap-1.5 rounded-full border border-primary bg-primary/8 px-2.5 text-xs text-primary outline-offset-2 hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-ring"
    >
      {label}
      <XIcon aria-hidden="true" className="size-3" />
    </button>
  );
}
