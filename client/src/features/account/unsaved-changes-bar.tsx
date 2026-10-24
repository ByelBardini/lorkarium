import { Loader2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** What the bar says: an edit waits, it is being saved, or it was just saved (for 2 s). */
export type UnsavedChangesState = 'dirty' | 'saving' | 'saved';

export type UnsavedChangesBarProps = Readonly<{
  state: UnsavedChangesState;
  /** A field is invalid: "Salvar alterações" waits for it. */
  invalid: boolean;
  /** The refusal of the last save, shown in the bar. */
  failureMessage: string | null;
  onDiscard: () => void;
}>;

const STATE_TEXT: Readonly<Record<UnsavedChangesState, string>> = {
  dirty: 'Você tem alterações não salvas.',
  saving: 'Você tem alterações não salvas.',
  saved: 'Tudo salvo.',
};

/** The bar pinned at the bottom of the profile while an edit waits: "Descartar" and "Salvar
 *  alterações" (the form's submit). Surface, not shadow: `bg-muted` with a border.
 *
 *  Example: `{barState && <UnsavedChangesBar state={barState} invalid={false} failureMessage={null} onDiscard={draft.discard} />}` */
export function UnsavedChangesBar(props: UnsavedChangesBarProps): React.JSX.Element {
  const saving = props.state === 'saving';
  return (
    <div
      role="region"
      aria-label="Alterações do perfil"
      aria-busy={saving}
      className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-muted px-4 py-3 sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12"
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
