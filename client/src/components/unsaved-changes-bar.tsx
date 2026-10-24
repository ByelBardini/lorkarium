import { Loader2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UnsavedChangesState } from '@/lib/unsaved-changes';
import { cn } from '@/lib/utils';

export type UnsavedChangesBarProps = Readonly<{
  /** The name of the region ("Alterações do perfil", "Alterações da mesa"). */
  label: string;
  state: UnsavedChangesState;
  /** A field is invalid: "Salvar alterações" waits for it. */
  invalid: boolean;
  /** The refusal of the last save, shown in the bar. */
  failureMessage: string | null;
  onDiscard: () => void;
  /** Where the bar meets the edges of its screen (the page gutters, the dialog padding). */
  className?: string;
}>;

const STATE_TEXT: Readonly<Record<UnsavedChangesState, string>> = {
  dirty: 'Você tem alterações não salvas.',
  saving: 'Você tem alterações não salvas.',
  saved: 'Tudo salvo.',
};

/** The bar pinned at the bottom of a form while an edit waits: "Descartar" and "Salvar
 *  alterações" (the form's submit). Surface, not shadow: `bg-muted` with a border.
 *
 *  Example: `{barState && <UnsavedChangesBar label="Alterações do perfil" state={barState} invalid={false} failureMessage={null} onDiscard={draft.discard} />}` */
export function UnsavedChangesBar(props: UnsavedChangesBarProps): React.JSX.Element {
  const saving = props.state === 'saving';
  return (
    <div
      role="region"
      aria-label={props.label}
      aria-busy={saving}
      className={cn(
        'sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-border bg-muted px-4 py-3',
        props.className,
      )}
    >
      <div className="mr-auto flex flex-col gap-0.5">
        <p role="status" className="text-sm text-label">
          {STATE_TEXT[props.state]}
        </p>
        {props.failureMessage && (
          <p role="alert" className="text-[13px] text-destructive-text">
            {props.failureMessage}
          </p>
        )}
      </div>
      {props.state !== 'saved' && <BarButtons {...props} saving={saving} />}
    </div>
  );
}

function BarButtons(
  props: UnsavedChangesBarProps & Readonly<{ saving: boolean }>,
): React.JSX.Element {
  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={props.saving}
        onClick={props.onDiscard}
      >
        Descartar
      </Button>
      <Button type="submit" size="lg" disabled={props.saving || props.invalid}>
        {props.saving && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {props.saving ? 'Salvando…' : 'Salvar alterações'}
      </Button>
    </div>
  );
}
