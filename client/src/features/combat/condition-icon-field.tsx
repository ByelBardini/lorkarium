import {
  CONDITION_ICONS,
  type ConditionColorDto,
  type ConditionIconDto,
  type ConditionToneDto,
} from '@lorkarium/contracts';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CONDITION_ICON_LIBRARIES,
  iconsOfLibrary,
  searchConditionIcons,
  type ConditionIconLibrary,
} from '@/lib/condition-icon-search';
import { suggestedIconsFor } from '@/lib/condition-icon-suggestions';
import { conditionIconLabelOf } from '@/lib/condition-icons';
import { ConditionIconGrid, type ConditionIconGridProps } from './condition-icon-grid';
import { ConditionIconPreview } from './condition-icon-preview';
import { ConditionGlyph } from './condition-marks';

const LIBRARY_NAMES: Readonly<Record<ConditionIconLibrary, string>> = {
  'game-icons': 'Game-icons',
  lucide: 'Lucide',
  tabler: 'Tabler',
  ph: 'Phosphor',
  mdi: 'Material',
};

type FieldLook = Readonly<{
  value: ConditionIconDto;
  tone: ConditionToneDto;
  color?: ConditionColorDto | null;
}>;

/** "Ícone" of a condition: one tile with the current mark that opens a wide popover with the
 *  search (Portuguese or English, every library), the icons suggested for the condition's `name`,
 *  one tab per library, a preview on the token and the Game-icons credit. Drawn in the chosen
 *  color (absent: the tone's); picking one closes it.
 *
 *  Example: `<ConditionIconField value={icon} tone={tone} name="Imobilizado" onChange={setIcon} />` */
export function ConditionIconField({
  name = '',
  onChange,
  ...look
}: FieldLook &
  Readonly<{ name?: string; onChange: (icon: ConditionIconDto) => void }>): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const pick = (icon: ConditionIconDto): void => {
    onChange(icon);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`Ícone: ${conditionIconLabelOf(look.value)}`}
        title="Escolher ícone"
        className="grid size-9 shrink-0 place-items-center rounded-md border border-input bg-card outline-offset-2 hover:border-primary focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ConditionGlyph icon={look.value} tone={look.tone} color={look.color} />
      </PopoverTrigger>
      <PopoverContent
        aria-label="Escolher ícone"
        align="start"
        className="flex w-110 max-w-[calc(100vw-2rem)] flex-col p-0"
      >
        <IconPicker {...look} name={name} onPick={pick} />
      </PopoverContent>
    </Popover>
  );
}

type PickerProps = FieldLook & Readonly<{ name: string; onPick: (icon: ConditionIconDto) => void }>;

function IconPicker({ name, onPick, ...look }: PickerProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [previewed, setPreviewed] = useState<ConditionIconDto | null>(null);
  const grid = { ...look, color: look.color ?? null, onPick, onPreview: setPreviewed };
  return (
    <>
      <div className="border-b border-border p-3">
        <Input
          type="search"
          aria-label="Buscar ícone"
          placeholder="Buscar em português ou inglês"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="max-h-[min(22rem,calc(var(--radix-popover-content-available-height)-10rem))] min-h-40 overflow-y-auto p-3">
        {query.trim() === '' ? (
          <Browse grid={grid} name={name} />
        ) : (
          <Results grid={grid} query={query} />
        )}
      </div>
      <ConditionIconPreview icon={previewed ?? look.value} tone={look.tone} color={grid.color} />
      <IconCredit />
    </>
  );
}

type GridLook = Omit<ConditionIconGridProps, 'label' | 'icons'>;

function Results({ grid, query }: Readonly<{ grid: GridLook; query: string }>): React.JSX.Element {
  const found = useMemo(() => searchConditionIcons(CONDITION_ICONS, query), [query]);
  if (found.length === 0)
    return <p className="text-[13px] text-muted-foreground">Nada com “{query.trim()}”</p>;
  const label = found.length === 1 ? '1 resultado' : `${found.length} resultados`;
  return (
    <>
      <p className="mb-2 text-[13px] text-muted-foreground">{label}</p>
      <ConditionIconGrid key={query} {...grid} label={label} icons={found} />
    </>
  );
}

function Browse({ grid, name }: Readonly<{ grid: GridLook; name: string }>): React.JSX.Element {
  const [library, setLibrary] = useState<ConditionIconLibrary>('game-icons');
  const suggested = suggestedIconsFor(name);
  return (
    <>
      {suggested.length > 0 && <Suggested grid={grid} name={name.trim()} icons={suggested} />}
      <Tabs value={library} onValueChange={(next) => setLibrary(next as ConditionIconLibrary)}>
        <TabsList aria-label="Bibliotecas" className="gap-3">
          {CONDITION_ICON_LIBRARIES.map((each) => (
            <TabsTrigger key={each} value={each} className="text-xs">
              {LIBRARY_NAMES[each]}
              <span className="text-muted-foreground tabular-nums">
                {iconsOfLibrary(CONDITION_ICONS, each).length.toLocaleString('pt-BR')}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {CONDITION_ICON_LIBRARIES.map((each) => (
          <TabsContent key={each} value={each} tabIndex={-1} className="pt-3">
            <ConditionIconGrid
              {...grid}
              label={LIBRARY_NAMES[each]}
              icons={iconsOfLibrary(CONDITION_ICONS, each)}
            />
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}

type SuggestedProps = Readonly<{
  grid: GridLook;
  name: string;
  icons: readonly ConditionIconDto[];
}>;

function Suggested({ grid, name, icons }: SuggestedProps): React.JSX.Element {
  const label = `Sugeridos para “${name}”`;
  return (
    <div className="mb-3">
      <p
        aria-hidden="true"
        className="mb-2 text-xs font-semibold tracking-wide text-label uppercase"
      >
        {label}
      </p>
      <ConditionIconGrid {...grid} label={label} icons={icons} />
    </div>
  );
}

function IconCredit(): React.JSX.Element {
  return (
    <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
      Game-icons por Lorc, Delapouite e colaboradores, em{' '}
      <a
        href="https://game-icons.net"
        target="_blank"
        rel="noreferrer"
        className="underline hover:text-foreground"
      >
        game-icons.net
      </a>{' '}
      (CC BY 3.0).
    </p>
  );
}
