import type { SheetConsoleLevelDto } from '@lorkarium/contracts';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SheetConsoleEntry, SheetConsoleLog } from '@/sheet-sandbox/sheet-console';
import { consolePositionLabel } from './sheet-console-labels';

/** What the console shows: every line, or one kind (`debug` goes with `log`). */
export type SheetConsoleFilter = 'all' | 'log' | 'info' | 'warn' | 'error';

const FILTERS: ReadonlyArray<Readonly<{ value: SheetConsoleFilter; label: string }>> = [
  { value: 'all', label: 'Tudo' },
  { value: 'log', label: 'Log' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Aviso' },
  { value: 'error', label: 'Erro' },
];

const LEVEL_LABEL: Readonly<Record<SheetConsoleLevelDto, string>> = {
  log: 'Log',
  info: 'Info',
  warn: 'Aviso',
  error: 'Erro',
  debug: 'Debug',
};

const LEVEL_TONE: Readonly<Record<SheetConsoleLevelDto, string>> = {
  log: 'text-foreground',
  info: 'text-chart-2',
  warn: 'text-primary',
  error: 'text-destructive-text',
  debug: 'text-muted-foreground',
};

function shown(entry: SheetConsoleEntry, filter: SheetConsoleFilter): boolean {
  if (filter === 'all') return true;
  return filter === 'log'
    ? entry.level === 'log' || entry.level === 'debug'
    : entry.level === filter;
}

export type SheetConsolePanelProps = Readonly<{
  log: SheetConsoleLog;
  onClear: () => void;
  className?: string;
}>;

/** The lines of a sheet's console: kind, time, text and, for an error of the author's JS, its
 *  line in the JS file; a filter by kind and "Limpar". The editor and the room's sheet share it.
 *
 *  Example: `<SheetConsolePanel log={console.log} onClear={console.clear} />` */
export function SheetConsolePanel(props: SheetConsolePanelProps): React.JSX.Element {
  const [filter, setFilter] = useState<SheetConsoleFilter>('all');
  const entries = props.log.entries.filter((entry) => shown(entry, filter));
  return (
    <div className={cn('flex min-h-0 flex-col', props.className)}>
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-divider px-2 py-1">
        <div role="group" aria-label="Filtrar o console" className="flex flex-wrap gap-0.5">
          {FILTERS.map((option) => (
            <FilterButton
              key={option.value}
              label={option.label}
              pressed={filter === option.value}
              onPress={() => setFilter(option.value)}
            />
          ))}
        </div>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={props.onClear}>
          Limpar
        </Button>
      </div>
      <ConsoleLines entries={entries} filtered={filter !== 'all'} />
    </div>
  );
}

type FilterButtonProps = Readonly<{ label: string; pressed: boolean; onPress: () => void }>;

function FilterButton({ label, pressed, onPress }: FilterButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      className={cn(
        'h-7 rounded-sm px-2 text-xs text-muted-foreground outline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring',
        pressed && 'bg-muted font-semibold text-foreground',
      )}
    >
      {label}
    </button>
  );
}

type ConsoleLinesProps = Readonly<{ entries: readonly SheetConsoleEntry[]; filtered: boolean }>;

function ConsoleLines({ entries, filtered }: ConsoleLinesProps): React.JSX.Element {
  const list = useRef<HTMLOListElement>(null);
  const lastId = entries.at(-1)?.id;
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [lastId]);
  return (
    <ol
      ref={list}
      role="log"
      aria-label="Linhas do console"
      className="min-h-0 flex-1 overflow-y-auto font-mono text-xs"
    >
      {entries.length === 0 && (
        <li className="px-3 py-2 font-sans text-muted-foreground">
          {filtered ? 'Nenhuma linha deste tipo.' : 'Nada no console ainda.'}
        </li>
      )}
      {entries.map((entry) => (
        <ConsoleLine key={entry.id} entry={entry} />
      ))}
    </ol>
  );
}

function ConsoleLine({ entry }: Readonly<{ entry: SheetConsoleEntry }>): React.JSX.Element {
  const error = entry.level === 'error';
  return (
    <li
      data-level={entry.level}
      className={cn(
        'flex gap-2 border-b border-divider/60 px-3 py-1 leading-5',
        error && 'border-l-2 border-l-destructive bg-destructive/10',
      )}
    >
      <span className={cn('w-11 shrink-0 font-sans font-semibold', LEVEL_TONE[entry.level])}>
        {LEVEL_LABEL[entry.level]}
      </span>
      <time dateTime={entry.at.toISOString()} className="shrink-0 text-placeholder">
        {entry.at.toTimeString().slice(0, 8)}
      </time>
      <span className="min-w-0 flex-1 break-words whitespace-pre-wrap text-foreground">
        {entry.text}
        {entry.position && (
          <span className="ml-2 font-sans text-muted-foreground">
            ({consolePositionLabel(entry.position)} do JS)
          </span>
        )}
      </span>
    </li>
  );
}
