import { MAX_BARS_PER_TOKEN, type BarColorDto } from '@lorkarium/contracts';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EyeIcon,
  LockIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StyleTileGroup, type StyleTile } from '@/features/drawings/style-tile-group';
import { BAR_COLOR_LABEL, barFill, barToneVar, formatBarValue } from '@/lib/bar-display';
import { digitsOnly } from '@/lib/numeric-text';
import { BarTrack } from './bar-track';
import {
  addBar,
  barSampleOf,
  barSuggestionsOf,
  moveBar,
  type BarFormErrors,
  type BarFormValues,
} from './bar-form-state';
import { BARS_HINT, DISPLAY_TEXT, VISIBILITY_TEXT } from './token-messages';

export type BarsEditorProps = Readonly<{
  bars: readonly BarFormValues[];
  errors: Readonly<Record<number, BarFormErrors>> | undefined;
  onChange: (bars: readonly BarFormValues[]) => void;
}>;

const BAR_COLOR_TILES: readonly StyleTile<BarColorDto>[] = (
  ['gold', 'steel', 'ember', 'moss', 'ash'] as const
).map((color) => ({
  value: color,
  label: BAR_COLOR_LABEL[color],
  picture: (
    <span
      aria-hidden="true"
      className="size-full rounded-full"
      style={{ background: barToneVar(color) }}
    />
  ),
}));

/** "Barras" of the token dialog: one block per bar (↑↓, its color, label, max, "No token" on the
 *  first, the five colors, who sees the numbers, number or percent, and a sample), "Nova barra"
 *  and the suggestions that add one bar at a time, up to `MAX_BARS_PER_TOKEN`. The current values
 *  are adjusted on the token card.
 *
 *  Example: `<BarsEditor bars={form.bars} errors={errors.bars} onChange={(bars) => setForm({ ...form, bars })} />` */
export function BarsEditor({ bars, errors, onChange }: BarsEditorProps): React.JSX.Element {
  const replace = (index: number, bar: BarFormValues): void =>
    onChange(bars.map((current, at) => (at === index ? bar : current)));
  return (
    <section aria-label="Barras" className="flex flex-col gap-3.5">
      {bars.length === 0 ? (
        <NoBars />
      ) : (
        <p className="text-[13px] text-muted-foreground">{BARS_HINT}</p>
      )}
      {bars.length > 0 && (
        <ol className="flex flex-col gap-3">
          {bars.map((bar, index) => (
            <BarRow
              key={bar.key}
              bar={bar}
              index={index}
              last={index === bars.length - 1}
              errors={errors?.[index]}
              onChange={(next) => replace(index, next)}
              onMove={(offset) => onChange(moveBar(bars, index, offset))}
              onRemove={() => onChange(bars.filter((_, at) => at !== index))}
            />
          ))}
        </ol>
      )}
      <AddBars bars={bars} onChange={onChange} />
    </section>
  );
}

function NoBars(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-input p-7 text-center">
      <span className="font-display text-[22px] font-semibold">Sem barras ainda</span>
      <span className="text-[13px] text-muted-foreground">
        Começa pelo PV ou escolhe uma das sugestões.
      </span>
    </div>
  );
}

function AddBars({ bars, onChange }: Pick<BarsEditorProps, 'bars' | 'onChange'>) {
  const full = bars.length >= MAX_BARS_PER_TOKEN;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!full && (
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(addBar(bars))}>
            <PlusIcon aria-hidden="true" />
            Nova barra
          </Button>
          {barSuggestionsOf(bars).map((preset) => (
            <Button
              key={preset.label}
              type="button"
              variant="ghost"
              size="sm"
              className="border border-dashed border-input"
              onClick={() => onChange(addBar(bars, preset))}
            >
              {`+ ${preset.label}`}
            </Button>
          ))}
        </>
      )}
      <span className="ml-auto text-xs tracking-[0.12em] text-placeholder uppercase">
        {`${bars.length} de ${MAX_BARS_PER_TOKEN}`}
      </span>
    </div>
  );
}

type BarRowProps = Readonly<{
  bar: BarFormValues;
  index: number;
  last: boolean;
  errors: BarFormErrors | undefined;
  onChange: (bar: BarFormValues) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
}>;

function BarRow(props: BarRowProps): React.JSX.Element {
  const { bar, index, last, onChange, onMove } = props;
  const name = bar.label.trim() || `Barra ${index + 1}`;
  return (
    <li
      aria-label={`Barra ${index + 1}: ${name}`}
      className={`flex flex-col gap-3 rounded-lg border bg-background p-3 ${index === 0 ? 'border-primary/40' : 'border-divider'}`}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex flex-col">
          <IconAction
            label={`Subir ${name}`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
            icon={ChevronUpIcon}
          />
          <IconAction
            label={`Descer ${name}`}
            disabled={last}
            onClick={() => onMove(1)}
            icon={ChevronDownIcon}
          />
        </div>
        <span
          aria-hidden="true"
          className="mt-1 h-9 w-2.5 shrink-0 rounded-sm"
          style={{ background: barToneVar(bar.color) }}
        />
        <BarRowFields
          bar={bar}
          index={index}
          name={name}
          errors={props.errors}
          onChange={onChange}
        />
        {index === 0 && (
          <span className="mt-3 shrink-0 text-[11px] font-semibold tracking-[0.12em] whitespace-nowrap text-primary uppercase">
            No token
          </span>
        )}
        <IconAction label={`Remover ${name}`} onClick={props.onRemove} icon={Trash2Icon} />
      </div>
      <BarLook bar={bar} name={name} onChange={onChange} />
    </li>
  );
}

type BarRowFieldsProps = Readonly<{
  bar: BarFormValues;
  index: number;
  name: string;
  errors: BarFormErrors | undefined;
  onChange: (bar: BarFormValues) => void;
}>;

// The label and the max, side by side; each error is tied to its own field.
function BarRowFields({ bar, index, name, errors, onChange }: BarRowFieldsProps) {
  const id = useId();
  return (
    <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
      <FieldWithError id={`${id}-label`} error={errors?.label}>
        <Input
          id={`${id}-label`}
          value={bar.label}
          maxLength={24}
          placeholder="Rótulo"
          aria-label={`Rótulo da barra ${index + 1}`}
          aria-invalid={errors?.label ? true : undefined}
          aria-describedby={errors?.label ? `${id}-label-error` : undefined}
          className="h-10 font-semibold"
          onChange={(event) => onChange({ ...bar, label: event.target.value })}
        />
      </FieldWithError>
      <FieldWithError id={`${id}-max`} error={errors?.max}>
        <div className="relative">
          <span
            aria-hidden="true"
            className="absolute top-1/2 left-3 -translate-y-1/2 text-xs text-placeholder"
          >
            Máx
          </span>
          <Input
            id={`${id}-max`}
            inputMode="numeric"
            value={bar.maxText}
            aria-label={`Máximo de ${name}`}
            aria-invalid={errors?.max ? true : undefined}
            aria-describedby={errors?.max ? `${id}-max-error` : undefined}
            className="h-10 pl-11 tabular-nums"
            onChange={(event) => onChange({ ...bar, maxText: digitsOnly(event.target.value) })}
          />
        </div>
      </FieldWithError>
    </div>
  );
}

type FieldWithErrorProps = Readonly<{
  id: string;
  error: string | undefined;
  children: React.ReactNode;
}>;

function FieldWithError({ id, error, children }: FieldWithErrorProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      {children}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive-text">
          {error}
        </p>
      )}
    </div>
  );
}

type BarLookProps = Readonly<{
  bar: BarFormValues;
  name: string;
  onChange: (bar: BarFormValues) => void;
}>;

function BarLook({ bar, name, onChange }: BarLookProps): React.JSX.Element {
  const visibility = VISIBILITY_TEXT[bar.visibility];
  const display = DISPLAY_TEXT[bar.display];
  const VisibilityIcon = bar.visibility === 'everyone' ? EyeIcon : LockIcon;
  return (
    <div className="flex flex-wrap items-center gap-2.5 sm:pl-9">
      <StyleTileGroup
        legend={`Cor de ${name}`}
        legendHidden
        value={bar.color}
        tiles={BAR_COLOR_TILES}
        shape="round"
        onChange={(color) => onChange({ ...bar, color })}
      />
      <Button
        type="button"
        variant="outline"
        size="xs"
        aria-label={`Quem vê os números de ${name}: ${visibility}`}
        onClick={() =>
          onChange({
            ...bar,
            visibility: bar.visibility === 'everyone' ? 'controllers' : 'everyone',
          })
        }
      >
        <VisibilityIcon aria-hidden="true" />
        {visibility}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="xs"
        aria-label={`Como ${name} aparece: ${display}`}
        onClick={() =>
          onChange({ ...bar, display: bar.display === 'number' ? 'percent' : 'number' })
        }
      >
        {display}
      </Button>
      <BarSample bar={bar} />
    </div>
  );
}

function BarSample({ bar }: Readonly<{ bar: BarFormValues }>): React.JSX.Element | null {
  const sample = barSampleOf(bar);
  if (!sample) return null;
  return (
    <div className="flex min-w-24 flex-1 items-center gap-2">
      <BarTrack fill={barFill(sample)} color={bar.color} className="flex-1" />
      <span className="text-xs font-semibold text-muted-foreground tabular-nums">
        {formatBarValue({ ...sample, display: bar.display })}
      </span>
    </div>
  );
}

type IconActionProps = Readonly<{
  label: string;
  icon: React.ComponentType<{ 'aria-hidden'?: boolean | 'true' }>;
  onClick: () => void;
  disabled?: boolean;
}>;

function IconAction({ label, icon: Icon, onClick, disabled }: IconActionProps): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
