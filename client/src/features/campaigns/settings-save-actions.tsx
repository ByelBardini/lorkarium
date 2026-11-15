import { Loader2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type SettingsSaveFlags = Readonly<{
  saving: boolean;
  dirty: boolean;
  /** A field is invalid: "Salvar alterações" waits for it. */
  invalid: boolean;
  justSaved: boolean;
}>;

export type SettingsSaveActionsProps = SettingsSaveFlags &
  Readonly<{
    /** The `id` of the settings form: the button sits in the top bar, outside it. */
    formId: string;
    /** The refusal of the last save. */
    failureMessage: string | null;
    onDiscard: () => void;
  }>;

type SaveStatus = Readonly<{ text: string; tone: string }>;

/** The save controls of "Configurações da mesa", in the page's top bar: a status that always
 *  says where the edits stand, "Descartar" and "Salvar alterações" (the form's submit, through
 *  the `form` attribute). Always there, enabled only with something to save.
 *
 *  Example: `<SettingsSaveActions formId="settings" saving={false} dirty invalid={false} justSaved={false} failureMessage={null} onDiscard={draft.discard} />` */
export function SettingsSaveActions(props: SettingsSaveActionsProps): React.JSX.Element {
  const status = saveStatusOf(props);
  return (
    <div
      role="region"
      aria-label="Alterações da mesa"
      aria-busy={props.saving}
      className="flex items-center gap-3"
    >
      <div className="flex flex-col items-end max-sm:sr-only">
        <p role="status" className={cn('flex items-center gap-1.5 text-xs', status.tone)}>
          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
          {status.text}
        </p>
        {props.failureMessage && (
          <p role="alert" className="text-xs text-destructive-text">
            {props.failureMessage}
          </p>
        )}
      </div>
      <SaveButtons {...props} />
    </div>
  );
}

function SaveButtons(props: SettingsSaveActionsProps): React.JSX.Element {
  const idle = !props.dirty || props.saving;
  return (
    <>
      <Button type="button" variant="ghost" size="sm" disabled={idle} onClick={props.onDiscard}>
        Descartar
      </Button>
      <Button
        type="submit"
        form={props.formId}
        size="sm"
        className="min-w-36"
        disabled={idle || props.invalid}
      >
        {props.saving && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {props.saving ? 'Salvando…' : 'Salvar alterações'}
      </Button>
    </>
  );
}

function saveStatusOf(flags: SettingsSaveFlags): SaveStatus {
  if (flags.saving) return { text: 'Salvando…', tone: 'text-primary' };
  if (flags.dirty && flags.invalid) {
    return { text: 'Confira os campos marcados.', tone: 'text-destructive-text' };
  }
  if (flags.dirty) return { text: 'Alterações não salvas.', tone: 'text-primary' };
  if (flags.justSaved) return { text: 'Tudo salvo.', tone: 'text-chart-4' };
  return { text: 'Sem alterações.', tone: 'text-placeholder' };
}
