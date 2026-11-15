import { useId } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { SettingsRow } from './settings-row';
import type { ProfileDraft, ProfilePreferenceField } from './use-profile-draft';

export type ProfileTextRowProps = Readonly<{
  draft: ProfileDraft;
  field: 'bio' | ProfilePreferenceField;
  title: string;
  description: string;
  /** The contracts' ceiling, shown in the counter. */
  max: number;
  rows?: number;
}>;

/** A free text of the profile ("Sobre você", "Sistemas e cenários"…): the textarea over the draft,
 *  its inline error and the `n/max` counter.
 *
 *  Example: `<ProfileTextRow draft={draft} field="contact" title="Contato" description="…" max={200} />` */
export function ProfileTextRow(props: ProfileTextRowProps): React.JSX.Element {
  const { draft, field } = props;
  const id = useId();
  const error = draft.errors[field];
  const value = draft.values[field];
  return (
    <SettingsRow title={props.title} titleFor={id} description={props.description}>
      <Textarea
        id={id}
        rows={props.rows ?? 3}
        value={value}
        onChange={(event) => draft.change({ [field]: event.target.value })}
        aria-invalid={error !== undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <div className="flex justify-between gap-4">
        <FieldError id={`${id}-error`} error={error} />
        <p className="ml-auto text-sm text-placeholder tabular-nums">
          {value.length}/{props.max}
        </p>
      </div>
    </SettingsRow>
  );
}

/** The inline error under a field of the profile; nothing without one.
 *
 *  Example: `<FieldError id="nick-error" error={draft.errors.name} />` */
export function FieldError({
  id,
  error,
}: Readonly<{ id: string; error: string | undefined }>): React.JSX.Element | null {
  if (!error) return null;
  return (
    <p id={id} className="text-sm text-destructive-text">
      {error}
    </p>
  );
}
