import { initialsOf } from '@lorkarium/game-core';
import { cn } from '@/lib/utils';
import { formSizeText, type FormDraft } from './forms-form-state';
import { TokenFace } from './token-face';

export type FormCardProps = Readonly<{
  form: FormDraft;
  /** Its place in the list: 0 is the base, and the key that switches to it is `index + 1`. */
  index: number;
  selected: boolean;
  /** The form the token has on the map now ("No mapa"). */
  onMap: boolean;
  /** Its name is wrong ("(com erro)" for the screen reader). */
  invalid: boolean;
  onSelect: () => void;
}>;

// The disc grows with the form, up to 3 cells, so the cards compare sizes at a glance.
function thumbSideOf({ width, height }: FormDraft): number {
  return Math.round(28 + Math.min(Math.max(width, height), 3) * 14);
}

/** One card of the "Formas" grid: the face, the name, the size and the key; "Base" on the first,
 *  "No mapa" on the one the token has now. Pressed while it is open in the editor.
 *
 *  Example: `<FormCard form={wolf} index={1} selected onMap={false} invalid={false} onSelect={open} />` */
export function FormCard(props: FormCardProps): React.JSX.Element {
  const { form, index, selected, onMap, invalid } = props;
  const side = thumbSideOf(form);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={props.onSelect}
      className={cn(
        'relative flex flex-col items-center gap-2 rounded-md border bg-card px-2.5 pt-3.5 pb-3 text-center outline-offset-2 transition-colors hover:border-placeholder focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none',
        selected ? 'border-primary ring-1 ring-primary' : 'border-divider',
        invalid && !selected && 'border-destructive',
      )}
    >
      <span className="mt-2 grid size-18 place-items-center">
        <span className="block" style={{ width: side, height: side }}>
          <TokenFace
            initials={initialsOf(form.name) || '?'}
            imageAssetId={form.imageAssetId}
            round={form.frame === 'round'}
            className={cn(
              'size-full bg-muted text-[13px] text-foreground ring-2 ring-label',
              form.frame === 'square' && 'rounded-sm',
            )}
          />
        </span>
      </span>
      <span className="font-display text-lg leading-tight font-semibold">
        {form.name.trim() || 'Sem nome'}
      </span>{' '}
      <span className="text-xs text-muted-foreground">
        {formSizeText(form)} · tecla {index + 1}
      </span>
      <CardMarks base={index === 0} onMap={onMap} invalid={invalid} />
    </button>
  );
}

type CardMarksProps = Readonly<{ base: boolean; onMap: boolean; invalid: boolean }>;

function CardMarks({ base, onMap, invalid }: CardMarksProps): React.JSX.Element {
  return (
    <>
      {base && (
        <>
          {' '}
          <span className="absolute top-2 left-2 text-[9px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
            Base
          </span>
        </>
      )}
      {onMap && (
        <>
          {' '}
          <span className="sr-only">No mapa</span>
        </>
      )}
      {invalid && (
        <>
          {' '}
          <span className="sr-only">(com erro)</span>
        </>
      )}
    </>
  );
}
