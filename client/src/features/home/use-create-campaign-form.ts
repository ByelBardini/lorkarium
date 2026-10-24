import { createCampaignRequestDto, type CreateCampaignRequestDto } from '@lorkarium/contracts';
import { useId, useState, type FormEvent } from 'react';
import {
  CREATE_FIELDS,
  createFieldMessage,
  type CreateField,
  type CreateValues,
} from './create-campaign-messages';

export type CreateFieldErrors = Partial<Record<CreateField, string>>;

/** What a text field needs from the form: its id, value and error wiring. */
export type CreateFieldBinding = Readonly<{
  id: string;
  value: string;
  error: string | undefined;
  onValueChange: (value: string) => void;
}>;

/** What the form sends up: the DTO body and the password typed, shown once in "Mesa criada". */
export type CreateCampaignSubmission = Readonly<{
  input: CreateCampaignRequestDto;
  password: string | null;
}>;

export type CreateCampaignFormState = Readonly<{
  values: CreateValues;
  bind: (field: CreateField) => CreateFieldBinding;
  change: (patch: Partial<CreateValues>) => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
}>;

const EMPTY_CREATE_VALUES: CreateValues = {
  name: '',
  system: '',
  description: '',
  password: '',
  status: 'building',
  visibility: 'private',
  cover: { kind: 'drawn', drawing: 0, tone: 1 },
  usePassword: false,
};

/** The state of the "Nova mesa" form: values, errors by field, and a submit that validates by the
 *  DTO and focuses the first invalid field.
 *
 *  Example: `const { values, bind, change, submit } = useCreateCampaignForm(onSubmit)` */
export function useCreateCampaignForm(
  onSubmit: (submission: CreateCampaignSubmission) => void,
): CreateCampaignFormState {
  const [values, setValues] = useState<CreateValues>(EMPTY_CREATE_VALUES);
  const [errors, setErrors] = useState<CreateFieldErrors>({});
  const idPrefix = useId();
  const idOf = (field: CreateField): string => `${idPrefix}-${field}`;
  const change = (patch: Partial<CreateValues>): void =>
    setValues((current) => ({ ...current, ...patch }));
  const bind = (field: CreateField): CreateFieldBinding => ({
    id: idOf(field),
    value: values[field],
    error: errors[field],
    onValueChange: (value) => change({ [field]: value }),
  });
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const checked = validateCreate(values);
    setErrors(checked.errors);
    if (checked.submission) return onSubmit(checked.submission);
    const first = CREATE_FIELDS.find((field) => checked.errors[field] !== undefined);
    // By id, not ref: the React Compiler forbids reading a ref-carrying object during render.
    if (first) document.getElementById(idOf(first))?.focus();
  };
  return { values, bind, change, submit };
}

type CreateCheck = Readonly<{
  submission: CreateCampaignSubmission | null;
  errors: CreateFieldErrors;
}>;

function validateCreate(values: CreateValues): CreateCheck {
  const { usePassword, ...fields } = values;
  const password = usePassword ? fields.password : '';
  const parsed = createCampaignRequestDto.safeParse({ ...fields, password });
  const errors = issuesOf(parsed.success ? [] : parsed.error.issues, values);
  // The DTO reads an empty password as "none"; with the switch on, empty is too short.
  if (usePassword && password === '') errors.password = createFieldMessage('password', values);
  if (!parsed.success || Object.keys(errors).length > 0) return { submission: null, errors };
  return { submission: { input: parsed.data, password: password || null }, errors };
}

function issuesOf(
  issues: readonly Readonly<{ path: readonly PropertyKey[] }>[],
  values: CreateValues,
): CreateFieldErrors {
  const errors: CreateFieldErrors = {};
  for (const issue of issues) {
    const field = CREATE_FIELDS.find((candidate) => candidate === issue.path[0]);
    if (field) errors[field] = createFieldMessage(field, values);
  }
  return errors;
}
