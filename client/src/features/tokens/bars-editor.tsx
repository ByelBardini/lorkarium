import { MAX_BARS_PER_TOKEN, type BarColorDto } from '@lorkarium/contracts';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useId } from 'react';
import { ChoiceField } from '@/components/choice-field';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BAR_COLOR_LABEL, barToneVar } from '@/lib/bar-display';
import { StyleTileGroup, type StyleTile } from '@/features/drawings/style-tile-group';
import { DISPLAY_OPTIONS, FIRST_BAR_HINT, VISIBILITY_OPTIONS } from './token-messages';
import {
  addBar,
  moveBar,
  type BarFormErrors,
  type BarFormValues,
  type TokenFormValues,
} from './token-form-state';

export type BarsEditorProps = Readonly<{
  form: TokenFormValues;
  errors: Readonly<Record<number, BarFormErrors>> | undefined;
  onChange: (form: TokenFormValues) => void;
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

/** How the N bars of a token are set up: label, color, who sees the numbers, number or percent,
 *  and the order (the first is drawn on the token). The values are adjusted on the token card,
 *  not here. Up to `MAX_BARS_PER_TOKEN`.
 *
 *  Example: `<BarsEditor form={form} errors={errors.bars} onChange={setForm} />` */
export function BarsEditor({ form, errors, onChange }: BarsEditorProps): React.JSX.Element {
  const full = form.bars.length >= MAX_BARS_PER_TOKEN;
  const replaceBar = (index: number, bar: BarFormValues): void =>
    onChange({ ...form, bars: form.bars.map((current, at) => (at === index ? bar : current)) });
  const removeBar = (index: number): void =>
    onChange({ ...form, bars: form.bars.filter((_, at) => at !== index) });
  return (
    <section aria-label="Barras" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-label">Barras</h3>
        <p className="text-[13px] text-muted-foreground">{FIRST_BAR_HINT}</p>
      </div>
      <ol className="flex flex-col">
        {form.bars.map((bar, index) => (
          <BarRow
            key={bar.key}
            bar={bar}
            index={index}
            last={index === form.bars.length - 1}
            errors={errors?.[index]}
            onChange={(next) => replaceBar(index, next)}
            onMove={(offset) => onChange(moveBar(form, index, offset))}
            onRemove={() => removeBar(index)}
          />
        ))}
      </ol>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={full}
          onClick={() => onChange(addBar(form))}
        >
          <PlusIcon aria-hidden="true" />
          Adicionar barra
        </Button>
        {full && (
          <p className="text-[13px] text-muted-foreground">
            Máximo de {MAX_BARS_PER_TOKEN} barras.
          </p>
        )}
      </div>
    </section>
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

function BarRow({
  bar,
  index,
  last,
  errors,
  onChange,
  onMove,
  onRemove,
}: BarRowProps): React.JSX.Element {
  const name = bar.label.trim() || `Barra ${index + 1}`;
  return (
    <li
      aria-label={`Barra ${index + 1}: ${name}`}
      className="flex flex-col gap-3 border-b border-divider py-3 last:border-b-0"
    >
      <div className="grid grid-cols-[1fr_auto] items-start gap-3">
        <BarLabel
          value={bar.label}
          error={errors?.label}
          onChange={(label) => onChange({ ...bar, label })}
        />
        <div className="flex gap-1 self-end pb-1">
          <IconAction
            label={`Subir ${name}`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
            icon={ArrowUpIcon}
          />
          <IconAction
            label={`Descer ${name}`}
            disabled={last}
            onClick={() => onMove(1)}
            icon={ArrowDownIcon}
          />
          <IconAction label={`Remover ${name}`} onClick={onRemove} icon={Trash2Icon} />
        </div>
      </div>
      <StyleTileGroup
        legend={`Cor de ${name}`}
        value={bar.color}
        tiles={BAR_COLOR_TILES}
        shape="round"
        onChange={(color) => onChange({ ...bar, color })}
      />
      <ChoiceField
        legend={`Quem vê os números de ${name}`}
        value={bar.visibility}
        options={VISIBILITY_OPTIONS}
        onChange={(visibility) => onChange({ ...bar, visibility })}
      />
      <ChoiceField
        legend={`Como ${name} aparece`}
        value={bar.display}
        options={DISPLAY_OPTIONS}
        onChange={(display) => onChange({ ...bar, display })}
      />
    </li>
  );
}

type BarLabelProps = Readonly<{
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
}>;

function BarLabel({ value, error, onChange }: BarLabelProps): React.JSX.Element {
  const id = useId();
  return (
    <FormField id={id} label="Rótulo" error={error}>
      <Input
        id={id}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
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
      size="icon-sm"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
