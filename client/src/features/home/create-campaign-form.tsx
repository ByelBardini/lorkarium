import {
  createCampaignRequestDto,
  type CampaignVisibilityDto,
  type CreateCampaignRequestDto,
} from '@lorkarium/contracts';
import { Loader2Icon } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { FormField } from '@/components/form-field';
import { PasswordField } from '@/components/password-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { failureMessage } from '@/features/campaigns/campaign-messages';
import type { CampaignsFailure } from '@/services/campaigns-api';
import {
  CREATE_FIELDS,
  createFieldMessage,
  type CreateField,
  type CreateValues,
} from './create-campaign-messages';
import { VisibilityField } from './visibility-field';

type FieldErrors = Partial<Record<CreateField, string>>;

/** What a field needs from the form: its id, value and error wiring. */
type FieldBinding = Readonly<{
  id: string;
  value: string;
  error: string | undefined;
  onValueChange: (value: string) => void;
}>;

const EMPTY_VALUES: CreateValues = {
  name: '',
  system: '',
  status: '',
  description: '',
  visibility: 'private',
  password: '',
};

export type CreateCampaignFormProps = Readonly<{
  submitting: boolean;
  failure: CampaignsFailure | null;
  onSubmit: (input: CreateCampaignRequestDto) => void;
  onCancel: () => void;
}>;

/** The "Nova mesa" form: validates by the contracts DTO and hands the normalized body up.
 *
 *  Example: `<CreateCampaignForm submitting={busy} failure={null} onSubmit={send} onCancel={close} />` */
export function CreateCampaignForm(props: CreateCampaignFormProps): React.JSX.Element {
  const { bind, visibility, setVisibility, submit } = useCreateCampaignForm(props.onSubmit);
  return (
    <form
      noValidate
      aria-label="Nova mesa"
      aria-busy={props.submitting}
      onSubmit={submit}
      className="flex flex-col gap-4"
    >
      {props.failure && <CreateFailure failure={props.failure} />}
      <TextField label="Nome da mesa" binding={bind('name')} placeholder="Os Sinos de Vharn" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Sistema (opcional)" binding={bind('system')} placeholder="Tormenta20" />
        <TextField label="Status (opcional)" binding={bind('status')} placeholder="Recrutando" />
      </div>
      <TextField label="Descrição (opcional)" binding={bind('description')} multiline />
      <VisibilityField value={visibility} onChange={setVisibility} />
      <PasswordBinding binding={bind('password')} />
      <FormButtons submitting={props.submitting} onCancel={props.onCancel} />
    </form>
  );
}

function useCreateCampaignForm(onSubmit: (input: CreateCampaignRequestDto) => void) {
  const [values, setValues] = useState<CreateValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<FieldErrors>({});
  const idPrefix = useId();
  const idOf = (field: CreateField): string => `${idPrefix}-${field}`;
  const change = (patch: Partial<CreateValues>): void =>
    setValues((current) => ({ ...current, ...patch }));
  const bind = (field: CreateField): FieldBinding => ({
    id: idOf(field),
    value: values[field],
    error: errors[field],
    onValueChange: (value) => change({ [field]: value }),
  });
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const checked = validateCreate(values);
    setErrors(checked.errors);
    if (checked.input) return onSubmit(checked.input);
    const first = CREATE_FIELDS.find((field) => checked.errors[field] !== undefined);
    // By id, not ref: the React Compiler forbids reading a ref-carrying object during render.
    if (first) document.getElementById(idOf(first))?.focus();
  };
  const setVisibility = (visibility: CampaignVisibilityDto): void => change({ visibility });
  return { bind, visibility: values.visibility, setVisibility, submit };
}

function validateCreate(values: CreateValues): {
  input: CreateCampaignRequestDto | null;
  errors: FieldErrors;
} {
  const parsed = createCampaignRequestDto.safeParse(values);
  if (parsed.success) return { input: parsed.data, errors: {} };
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = CREATE_FIELDS.find((candidate) => candidate === issue.path[0]);
    if (field) errors[field] = createFieldMessage(field, values);
  }
  return { input: null, errors };
}

function describedBy(binding: FieldBinding): string | undefined {
  return binding.error ? `${binding.id}-error` : undefined;
}

type TextFieldProps = Readonly<{
  label: string;
  binding: FieldBinding;
  placeholder?: string;
  multiline?: boolean;
}>;

function TextField({ label, binding, placeholder, multiline }: TextFieldProps): React.JSX.Element {
  const control = {
    id: binding.id,
    value: binding.value,
    placeholder,
    'aria-invalid': binding.error !== undefined,
    'aria-describedby': describedBy(binding),
  };
  return (
    <FormField id={binding.id} label={label} error={binding.error}>
      {multiline ? (
        <Textarea {...control} onChange={(event) => binding.onValueChange(event.target.value)} />
      ) : (
        <Input {...control} onChange={(event) => binding.onValueChange(event.target.value)} />
      )}
    </FormField>
  );
}

function PasswordBinding({ binding }: Readonly<{ binding: FieldBinding }>): React.JSX.Element {
  return (
    <FormField
      id={binding.id}
      label="Senha (opcional)"
      error={binding.error}
      hint="Quem entrar pelo código vai precisar dela."
    >
      <PasswordField
        id={binding.id}
        autoComplete="new-password"
        value={binding.value}
        onValueChange={binding.onValueChange}
        invalid={binding.error !== undefined}
        describedBy={describedBy(binding)}
      />
    </FormField>
  );
}

function CreateFailure({ failure }: Readonly<{ failure: CampaignsFailure }>): React.JSX.Element {
  const message =
    failure.kind === 'invalid'
      ? 'Confira os campos e tente de novo.'
      : failureMessage(failure.kind);
  return (
    <Alert variant="destructive" className="px-3.5 py-3 text-sm">
      {message}
    </Alert>
  );
}

type FormButtonsProps = Readonly<{ submitting: boolean; onCancel: () => void }>;

function FormButtons({ submitting, onCancel }: FormButtonsProps): React.JSX.Element {
  return (
    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" size="lg" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" size="lg" disabled={submitting}>
        {submitting && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {submitting ? 'Criando…' : 'Criar mesa'}
      </Button>
    </div>
  );
}
