import { MAX_BARS_PER_TOKEN } from '@lorkarium/contracts';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useId } from 'react';
import { ChoiceField } from '@/components/choice-field';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { COLOR_OPTIONS, FIRST_BAR_HINT, VISIBILITY_OPTIONS } from './token-messages';
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

/** The N bars of a token: label, current and maximum, color, who sees the numbers, and the
 *  order (the first is drawn on the token). Up to `MAX_BARS_PER_TOKEN`.
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
      <div className="grid grid-cols-[1fr_5rem_5rem_auto] items-start gap-3">
        <BarText
          label="Rótulo"
          value={bar.label}
          error={errors?.label}
          onChange={(label) => onChange({ ...bar, label })}
        />
        <BarText
          label="Atual"
          value={bar.current}
          error={errors?.current}
          numeric
          onChange={(current) => onChange({ ...bar, current })}
        />
        <BarText
          label="Máximo"
          value={bar.max}
          error={errors?.max}
          numeric
          onChange={(max) => onChange({ ...bar, max })}
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
      <ChoiceField
        legend={`Cor de ${name}`}
        value={bar.color}
        options={COLOR_OPTIONS}
        onChange={(color) => onChange({ ...bar, color })}
      />
      <ChoiceField
        legend={`Quem vê os números de ${name}`}
        value={bar.visibility}
        options={VISIBILITY_OPTIONS}
        onChange={(visibility) => onChange({ ...bar, visibility })}
      />
    </li>
  );
}

type BarTextProps = Readonly<{
  label: string;
  value: string;
  error: string | undefined;
  numeric?: boolean;
  onChange: (value: string) => void;
}>;

function BarText({ label, value, error, numeric, onChange }: BarTextProps): React.JSX.Element {
  const id = useId();
  return (
    <FormField id={id} label={label} error={error}>
      <Input
        id={id}
        value={value}
        inputMode={numeric ? 'numeric' : undefined}
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
