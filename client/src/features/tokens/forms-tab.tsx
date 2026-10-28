import {
  TOKEN_FORM_NAME_MAX_LENGTH,
  TOKEN_FORMS_MAX,
  type TokenFrameDto,
} from '@lorkarium/contracts';
import { PlusIcon } from 'lucide-react';
import { useId } from 'react';
import { FormField } from '@/components/form-field';
import { SegmentField, type SegmentOption } from '@/components/segment-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { initialsOf } from '@/lib/token-initials';
import type { AssetsApi } from '@/services/assets-api';
import { FormCard } from './form-card';
import { FormImageField } from './form-image-field';
import {
  addForm,
  canAddForm,
  duplicateForm,
  makeBaseForm,
  patchForm,
  removeForm,
  selectForm,
  type FormDraft,
  type FormLook,
  type FormsFormErrors,
  type FormsFormValues,
} from './forms-form-state';
import { SizeField } from './size-field';

/** An update of the list: functional, so an image that arrives after its upload keeps the rest. */
export type FormsUpdate = (update: (forms: FormsFormValues) => FormsFormValues) => void;

export type FormsTabProps = Readonly<{
  forms: FormsFormValues;
  errors: FormsFormErrors | undefined;
  /** The look in "Básico" now: the base copies it on the first "Nova forma". */
  look: FormLook;
  /** The form the token has on the map now. */
  activeFormId: string | null;
  images: Readonly<{ campaignId: string; assets: AssetsApi }>;
  onChange: FormsUpdate;
  /** The id of a new form (`crypto.randomUUID` when absent). */
  newFormId?: () => string;
}>;

const randomFormId = (): string => crypto.randomUUID();

const FRAME_OPTIONS: readonly SegmentOption<TokenFrameDto>[] = [
  { value: 'square', label: 'Quadrada' },
  { value: 'round', label: 'Redonda' },
];

/** "Formas" of "Editar token": the editor of the open form on top — image, name, size, frame,
 *  "Duplicar", "Tornar base", "Excluir forma" — and, under it, the cards (up to 8, the first is
 *  the base).
 *
 *  Example: `<FormsTab forms={form.forms} errors={errors.forms} look={look} activeFormId={token.activeFormId} images={images} onChange={setForms} />` */
export function FormsTab(props: FormsTabProps): React.JSX.Element {
  const { forms, errors, onChange } = props;
  const newId = props.newFormId ?? randomFormId;
  const selected = forms.list.find(({ id }) => id === forms.selectedId) ?? null;
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Cada forma guarda uma imagem, uma borda e um tamanho. A primeira é a{' '}
        <strong className="font-semibold text-label">forma base</strong>, a de quando o token volta
        ao normal. No mapa, troque pelo menu do token ou pelas teclas 1 a {TOKEN_FORMS_MAX}.
      </p>
      {selected && (
        <FormEditor
          key={selected.id}
          form={selected}
          base={forms.list[0]?.id === selected.id}
          canAdd={canAddForm(forms)}
          error={errors?.[selected.id]}
          images={props.images}
          onChange={onChange}
          newId={newId}
        />
      )}
      <FormCards {...props} newId={newId} />
    </div>
  );
}

type FormCardsProps = FormsTabProps & Readonly<{ newId: () => string }>;

function FormCards(props: FormCardsProps): React.JSX.Element {
  const { forms, errors, onChange, newId } = props;
  return (
    <ul aria-label="Formas do token" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {forms.list.map((form, index) => (
        <li key={form.id} className="grid">
          <FormCard
            form={form}
            index={index}
            selected={form.id === forms.selectedId}
            onMap={form.id === props.activeFormId}
            invalid={errors?.[form.id] !== undefined}
            onSelect={() => onChange((current) => selectForm(current, form.id))}
          />
        </li>
      ))}
      {canAddForm(forms) && (
        <li className="grid">
          <NewFormButton
            onClick={() => onChange((current) => addForm(current, props.look, newId))}
          />
        </li>
      )}
    </ul>
  );
}

function NewFormButton({ onClick }: Readonly<{ onClick: () => void }>): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-37 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-input text-[13px] font-medium text-muted-foreground outline-offset-2 transition-colors hover:border-primary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
    >
      <span className="grid size-9 place-items-center rounded-full border border-current">
        <PlusIcon aria-hidden="true" className="size-4" />
      </span>
      Nova forma
    </button>
  );
}

type FormEditorProps = Readonly<{
  form: FormDraft;
  base: boolean;
  canAdd: boolean;
  error: string | undefined;
  images: FormsTabProps['images'];
  onChange: FormsUpdate;
  newId: () => string;
}>;

function FormEditor(props: FormEditorProps): React.JSX.Element {
  const { form, onChange } = props;
  const patch = (fields: Partial<FormLook>): void =>
    onChange((current) => patchForm(current, form.id, fields));
  return (
    <section
      aria-label={`Forma ${form.name.trim() || 'sem nome'}`}
      className="flex flex-col rounded-md border border-border bg-background"
    >
      <div className="flex flex-col gap-5 p-4 sm:flex-row">
        <FormImageField
          campaignId={props.images.campaignId}
          assets={props.images.assets}
          imageAssetId={form.imageAssetId}
          initials={initialsOf(form.name) || '?'}
          round={form.frame === 'round'}
          onChange={(asset) => patch({ imageAssetId: asset?.id ?? null })}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <FormNameField
            name={form.name}
            error={props.error}
            onChange={(name) => patch({ name })}
          />
          <SizeField size={form} onChange={patch} />
          <SegmentField
            legend="Borda"
            value={form.frame}
            options={FRAME_OPTIONS}
            fill
            onChange={(frame) => patch({ frame })}
          />
        </div>
      </div>
      <FormActions {...props} />
    </section>
  );
}

type FormNameFieldProps = Readonly<{
  name: string;
  error: string | undefined;
  onChange: (name: string) => void;
}>;

function FormNameField({ name, error, onChange }: FormNameFieldProps): React.JSX.Element {
  const id = useId();
  return (
    <FormField id={id} label="Nome da forma" error={error}>
      <Input
        id={id}
        value={name}
        maxLength={TOKEN_FORM_NAME_MAX_LENGTH}
        placeholder="Ex.: Lobo atroz"
        aria-invalid={error !== undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  );
}

function FormActions({ form, base, canAdd, onChange, newId }: FormEditorProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5 border-t border-divider px-2 py-2">
      <Button
        type="button"
        variant="ghost"
        disabled={!canAdd}
        onClick={() => onChange((current) => duplicateForm(current, form.id, newId))}
      >
        Duplicar
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={base}
        onClick={() => onChange((current) => makeBaseForm(current, form.id))}
      >
        Tornar base
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="ml-auto text-destructive-text"
        disabled={base}
        onClick={() => onChange((current) => removeForm(current, form.id))}
      >
        Excluir forma
      </Button>
    </div>
  );
}
