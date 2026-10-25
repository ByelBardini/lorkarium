import { CONDITION_DESCRIPTION_MAX_LENGTH, CONDITION_NAME_MAX_LENGTH } from '@lorkarium/contracts';
import { LoaderCircleIcon } from 'lucide-react';
import { useId, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { FormField } from '@/components/form-field';
import { ImagePicker } from '@/components/image-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ConditionIconField } from '@/features/combat/condition-icon-field';
import { ConditionLookField } from '@/features/combat/condition-look-field';
import { ConditionTagPreview } from '@/features/combat/condition-tag';
import { ConditionToneField } from '@/features/combat/condition-tone-field';
import type { AssetsApi } from '@/services/assets-api';
import type { BoardCommandFailure, BoardCommandResult } from '@/services/table-board-commands';
import { catalogFailureMessage, type ConditionFormValues } from './condition-catalog-link';
import {
  conditionFormDraftOf,
  conditionPreviewOf,
  sameConditionValues,
  sentConditionValuesOf,
  type ConditionFormDraft,
} from './condition-form-draft';
import { ConditionColorField } from './condition-color-field';
import { ConditionStacksField } from './condition-stacks-field';

/** Where the form's "Imagem" sends the picture: the table's assets. */
export type ConditionImageTarget = Readonly<{ campaignId: string; assets: AssetsApi }>;

export type ConditionDefinitionFormProps = Readonly<{
  /** `edit` saves changes to a condition of the list; `new` creates one. */
  mode: 'edit' | 'new';
  /** The form's name, e.g. "Editar Envenenado" or "Nova condição". */
  label: string;
  initial: ConditionFormValues;
  images: ConditionImageTarget;
  /** Beside the title, e.g. "Excluir Envenenado". */
  action?: ReactNode;
  /** Sends the values (name and description trimmed, the stacks parsed). */
  onSubmit: (values: ConditionFormValues) => Promise<BoardCommandResult>;
  /** Only `new`: gives up creating. An edit is discarded in place instead. */
  onCancel?: () => void;
}>;

type FormState = Readonly<{
  draft: ConditionFormDraft;
  busy: boolean;
  failure: BoardCommandFailure | null;
}>;

/** A condition of the table's list being written, in the editor of "Condições da mesa": the
 *  title with the tag as a token shows it (live), name, icon and nature, image (in place of the
 *  icon), color, look on the token, stacking and description ("N/500"). An edit saves only a change ("Descartar" goes back to the
 *  saved one, as does Esc); a new one is created or given up. A refusal keeps what was typed and
 *  says why.
 *
 *  Example: `<ConditionDefinitionForm mode="new" label="Nova condição" initial={NEW_CONDITION_VALUES} images={{ campaignId, assets }} onSubmit={create} onCancel={close} />` */
export function ConditionDefinitionForm(props: ConditionDefinitionFormProps): React.JSX.Element {
  const fresh: FormState = {
    draft: conditionFormDraftOf(props.initial),
    busy: false,
    failure: null,
  };
  const [state, setState] = useState<FormState>(fresh);
  const change = (edit: Partial<ConditionFormDraft>): void =>
    setState((current) => ({ ...current, draft: { ...current.draft, ...edit }, failure: null }));
  const giveUp = props.mode === 'new' ? props.onCancel : () => setState(fresh);
  const sent = sentConditionValuesOf(state.draft);
  const dirty = sent === null || !sameConditionValues(sent, props.initial);
  // An untouched edit lets Esc through: whoever holds the form (the sheet) closes on it.
  const escape = props.mode === 'edit' && !dirty ? undefined : giveUp;
  return (
    <form
      noValidate
      aria-label={props.label}
      aria-busy={state.busy}
      // The sheet reads it: Esc on a changed form only resets it, the sheet stays.
      data-dirty={dirty || undefined}
      onSubmit={submitOf(props, state, setState)}
      onKeyDown={(event) => cancelOnEscape(event, escape)}
      className="flex flex-col gap-5"
    >
      <FormHeader label={props.label} draft={state.draft} action={props.action} />
      <ConditionFormFields
        draft={state.draft}
        failure={state.failure}
        autoFocus={props.mode === 'new'}
        images={props.images}
        onChange={change}
      />
      <FormFooter
        mode={props.mode}
        state={state}
        sendable={sent !== null}
        dirty={dirty}
        onGiveUp={giveUp}
      />
    </form>
  );
}

function submitOf(
  props: ConditionDefinitionFormProps,
  state: FormState,
  setState: (update: (current: FormState) => FormState) => void,
): (event: FormEvent<HTMLFormElement>) => void {
  return (event) => {
    event.preventDefault();
    const values = sentConditionValuesOf(state.draft);
    if (state.busy || !values || values.name === '') return;
    setState((current) => ({ ...current, busy: true, failure: null }));
    void props.onSubmit(values).then((result) => {
      setState((current) => ({
        ...current,
        busy: false,
        failure: result.ok ? null : result.failure,
      }));
    });
  };
}

// Esc from a popover of the form (the icon list) is the popover's: it is portaled, so its keys
// still bubble here through React but not through the DOM.
function cancelOnEscape(event: KeyboardEvent<HTMLFormElement>, giveUp?: () => void): void {
  if (event.key !== 'Escape' || !giveUp) return;
  if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
  event.preventDefault();
  giveUp();
}

type FormHeaderProps = Readonly<{
  label: string;
  draft: ConditionFormDraft;
  action?: ReactNode;
}>;

function FormHeader({ label, draft, action }: FormHeaderProps): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-divider pb-4">
      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="truncate font-display text-2xl text-foreground">{label}</h2>
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <span>No token:</span>
          <ConditionTagPreview condition={conditionPreviewOf(draft)} />
        </div>
      </div>
      {action}
    </div>
  );
}

type FieldsProps = Readonly<{
  draft: ConditionFormDraft;
  failure: BoardCommandFailure | null;
  autoFocus: boolean;
  images: ConditionImageTarget;
  onChange: (edit: Partial<ConditionFormDraft>) => void;
}>;

function ConditionFormFields({ draft, failure, autoFocus, images, onChange }: FieldsProps) {
  return (
    <div className="grid gap-x-6 gap-y-5 @3xl:grid-cols-2">
      <NameField
        value={draft.name}
        taken={failure === 'name_taken'}
        autoFocus={autoFocus}
        onChange={(name) => onChange({ name })}
      />
      <IconAndToneFields draft={draft} onChange={onChange} />
      <ImageField
        value={draft.imageAssetId}
        images={images}
        onChange={(imageAssetId) => onChange({ imageAssetId })}
      />
      <ConditionColorField
        value={draft.color}
        tone={draft.tone}
        onChange={(color) => onChange({ color })}
      />
      <div className="flex flex-col gap-2">
        {/* The field's legend is only read; here, with room to spare, it is also shown. */}
        <span aria-hidden="true" className="text-[13px] text-label">
          Aparência no token
        </span>
        <ConditionLookField value={draft.look} onChange={(look) => onChange({ look })} />
      </div>
      <ConditionStacksField draft={draft.stacks} onChange={(stacks) => onChange({ stacks })} />
      <div className="@3xl:col-span-2">
        <DescriptionField
          value={draft.description}
          onChange={(description) => onChange({ description })}
        />
      </div>
    </div>
  );
}

type DraftFieldProps = Readonly<{
  draft: ConditionFormDraft;
  onChange: (edit: Partial<ConditionFormDraft>) => void;
}>;

function IconAndToneFields({ draft, onChange }: DraftFieldProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] text-label">Ícone e natureza</span>
      <div className="flex gap-2">
        <ConditionIconField
          value={draft.icon}
          tone={draft.tone}
          color={draft.color}
          onChange={(icon) => onChange({ icon })}
        />
        <ConditionToneField value={draft.tone} onChange={(tone) => onChange({ tone })} />
      </div>
    </div>
  );
}

type ImageFieldProps = Readonly<{
  value: string | null;
  images: ConditionImageTarget;
  onChange: (imageAssetId: string | null) => void;
}>;

// The image covers the disc where the icon goes; the icon stays saved as its fallback.
function ImageField({ value, images, onChange }: ImageFieldProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <ImagePicker
        campaignId={images.campaignId}
        purpose="condition"
        assets={images.assets}
        value={value}
        onChange={(asset) => onChange(asset?.id ?? null)}
        label="Imagem"
        removeLabel="Voltar ao ícone"
      />
      <p className="text-[13px] text-muted-foreground">O ícone aparece se a imagem não carregar.</p>
    </div>
  );
}

type NameFieldProps = Readonly<{
  value: string;
  taken: boolean;
  autoFocus: boolean;
  onChange: (name: string) => void;
}>;

function NameField({ value, taken, autoFocus, onChange }: NameFieldProps): React.JSX.Element {
  const id = useId();
  const empty = value.trim() === '';
  return (
    <FormField
      id={id}
      label="Nome"
      error={taken ? catalogFailureMessage('name_taken') : undefined}
      hint={empty ? 'Informe o nome.' : `${value.length}/${CONDITION_NAME_MAX_LENGTH}`}
    >
      <Input
        id={id}
        value={value}
        maxLength={CONDITION_NAME_MAX_LENGTH}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={taken}
        aria-describedby={taken ? `${id}-error` : undefined}
        className="h-10"
      />
    </FormField>
  );
}

function DescriptionField({
  value,
  onChange,
}: Readonly<{ value: string; onChange: (description: string) => void }>): React.JSX.Element {
  const id = useId();
  return (
    <FormField
      id={id}
      label="Descrição"
      error={undefined}
      hint={`${value.length}/${CONDITION_DESCRIPTION_MAX_LENGTH}`}
    >
      <Textarea
        id={id}
        value={value}
        rows={5}
        maxLength={CONDITION_DESCRIPTION_MAX_LENGTH}
        placeholder="O que a condição faz na mesa. Aparece no token, no cartão e na lista."
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  );
}

type FormFooterProps = Readonly<{
  mode: 'edit' | 'new';
  state: FormState;
  /** Every field holds what the server takes (the stacks may not, while typed). */
  sendable: boolean;
  dirty: boolean;
  onGiveUp?: () => void;
}>;

function FormFooter(props: FormFooterProps): React.JSX.Element {
  const { mode, state, dirty, onGiveUp } = props;
  const { draft, busy, failure } = state;
  const editing = mode === 'edit';
  const blocked = busy || !props.sendable || draft.name.trim() === '' || (editing && !dirty);
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-divider pt-4">
      {failure && failure !== 'name_taken' && (
        <p role="alert" className="mr-auto text-[13px] text-destructive-text">
          {catalogFailureMessage(failure)}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={busy || (editing && !dirty)}
        onClick={onGiveUp}
      >
        {editing ? 'Descartar' : 'Cancelar'}
      </Button>
      <Button type="submit" disabled={blocked} aria-busy={busy}>
        {busy && <LoaderCircleIcon aria-hidden="true" className="animate-spin" />}
        {submitLabel(editing, busy)}
      </Button>
    </div>
  );
}

function submitLabel(editing: boolean, busy: boolean): string {
  if (busy) return 'Salvando…';
  return editing ? 'Salvar alterações' : 'Criar condição';
}
