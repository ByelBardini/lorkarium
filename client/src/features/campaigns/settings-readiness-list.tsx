import { CheckIcon } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/utils';
import { readinessOf, type ReadinessItem, type ReadinessValues } from './settings-readiness';
import { jumpToSettingsSection } from './settings-section-jump';
import { SETTINGS_SECTIONS } from './settings-sections';

/** "Pronta pra receber gente": what makes the table inviting, counted and drawn as progress, each
 *  item a button to the section that fixes it. Done or not is said in words, never by color only.
 *
 *  Example: `<SettingsReadinessList values={draft.values} />` */
export function SettingsReadinessList({
  values,
}: Readonly<{ values: ReadinessValues }>): React.JSX.Element {
  const titleId = useId();
  const items = readinessOf(values);
  const done = items.filter((item) => item.done).length;
  const complete = done === items.length;
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-1 rounded-md border border-divider bg-card px-4 py-3.5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={titleId} className="text-[13px] font-semibold">
          Pronta pra receber gente
        </h2>
        <span className={cn('text-xs', complete ? 'text-chart-4' : 'text-primary')}>
          {done} de {items.length}
        </span>
      </div>
      <div
        role="progressbar"
        aria-labelledby={titleId}
        aria-valuemin={0}
        aria-valuemax={items.length}
        aria-valuenow={done}
        className="mt-1 mb-1.5 h-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            'h-full transition-[width] motion-reduce:transition-none',
            complete ? 'bg-chart-4' : 'bg-primary',
          )}
          style={{ width: `${(done / items.length) * 100}%` }}
        />
      </div>
      <ul className="flex flex-col">
        {items.map((item) => (
          <ReadinessRow key={item.key} item={item} />
        ))}
      </ul>
    </section>
  );
}

function ReadinessRow({ item }: Readonly<{ item: ReadinessItem }>): React.JSX.Element {
  const labelId = useId();
  const stateId = useId();
  const where = SETTINGS_SECTIONS[item.section].title;
  return (
    <li>
      <button
        type="button"
        aria-labelledby={labelId}
        aria-describedby={stateId}
        onClick={() => jumpToSettingsSection(item.section)}
        className="flex w-full items-center gap-2.5 rounded-sm py-1.5 text-left text-[13px] text-muted-foreground outline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid size-[18px] shrink-0 place-items-center rounded-full',
            item.done ? 'bg-chart-4 text-background' : 'ring-[1.5px] ring-input ring-inset',
          )}
        >
          {item.done && <CheckIcon className="size-3" strokeWidth={3.2} />}
        </span>
        <span id={labelId} className={cn('flex-1', !item.done && 'text-foreground')}>
          {item.label}
        </span>
        <span id={stateId} className="text-[11px] text-placeholder">
          <span className="sr-only">{item.done ? 'Feito' : `Falta, em ${where}`}</span>
          <span aria-hidden="true">{where}</span>
        </span>
      </button>
    </li>
  );
}
