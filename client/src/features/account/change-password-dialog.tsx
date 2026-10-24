import {
  NEW_PASSWORD_MIN_LENGTH,
  newPasswordDto,
  type ChangePasswordRequestDto,
} from '@lorkarium/contracts';
import { useId, useState, type FormEvent } from 'react';
import { FormField } from '@/components/form-field';
import { PasswordField } from '@/components/password-field';
import { AccountDialog, DialogButtons, DialogFailure } from './account-dialog';
import { FIELD_MESSAGES, accountFailureMessage, type AccountFailure } from './account-messages';
import { failureOf, useAccountFetcher, useOnSettled } from './use-account-fetcher';

type PasswordValues = { current: string; next: string; confirm: string };
type PasswordErrors = Partial<Record<keyof PasswordValues, string>>;

export type ChangePasswordDialogProps = Readonly<{
  onClose: () => void;
  /** The password changed (and the other devices were signed out). */
  onChanged: () => void;
}>;

/** "Trocar senha": the current one, the new one (8 to 256, no composition rule) and its repeat.
 *  A wrong current password is cleared and focused in its own field.
 *
 *  Example: `{dialog === 'password' && <ChangePasswordDialog onClose={close} onChanged={announce} />}` */
export function ChangePasswordDialog({
  onClose,
  onChanged,
}: ChangePasswordDialogProps): React.JSX.Element {
  const form = usePasswordForm(onChanged);
  const ids = { current: useId(), next: useId(), confirm: useId() };
  const { values, errors } = form;
  const field = (name: keyof PasswordValues) => ({
    id: ids[name],
    value: values[name],
    onValueChange: (value: string) => form.change({ [name]: value }),
    invalid: errors[name] !== undefined,
    describedBy: errors[name] ? `${ids[name]}-error` : undefined,
  });
  return (
    <AccountDialog
      title="Trocar senha"
      description="Ao trocar, os outros aparelhos saem da conta."
      onClose={onClose}
    >
      <form
        noValidate
        aria-label="Trocar senha"
        aria-busy={form.busy}
        onSubmit={(event) => form.submit(event, ids)}
        className="flex flex-col gap-4"
      >
        <DialogFailure failure={form.alert} />
        <FormField id={ids.current} label="Senha atual" error={errors.current}>
          <PasswordField key={form.attempt} autoFocus={form.attempt > 0} {...field('current')} />
        </FormField>
        <FormField
          id={ids.next}
          label="Senha nova"
          error={errors.next}
          hint={`De ${NEW_PASSWORD_MIN_LENGTH} a 256 caracteres.`}
        >
          <PasswordField autoComplete="new-password" {...field('next')} />
        </FormField>
        <FormField id={ids.confirm} label="Repita a senha nova" error={errors.confirm}>
          <PasswordField autoComplete="new-password" {...field('confirm')} />
        </FormField>
        <DialogButtons
          busy={form.busy}
          submitLabel="Trocar senha"
          busyLabel="Trocando…"
          onCancel={onClose}
        />
      </form>
    </AccountDialog>
  );
}

type PasswordForm = Readonly<{
  values: PasswordValues;
  errors: PasswordErrors;
  /** Bumped on each wrong current password: the field remounts empty and focused. */
  attempt: number;
  busy: boolean;
  alert: AccountFailure | null;
  change: (patch: Partial<PasswordValues>) => void;
  submit: (event: FormEvent<HTMLFormElement>, ids: FieldIds) => void;
}>;

type FieldIds = Record<keyof PasswordValues, string>;

function usePasswordForm(onChanged: () => void): PasswordForm {
  const fetcher = useAccountFetcher();
  const [values, setValues] = useState<PasswordValues>({ current: '', next: '', confirm: '' });
  const [localErrors, setLocalErrors] = useState<PasswordErrors>({});
  const [attempt, setAttempt] = useState(0);
  const failure = failureOf(fetcher.settled);
  const change = (patch: Partial<PasswordValues>): void =>
    setValues((now) => ({ ...now, ...patch }));
  useOnSettled(fetcher.settled, (result) => {
    if ('done' in result) return onChanged();
    if (!('failure' in result) || result.failure.kind !== 'current_password_invalid') return;
    change({ current: '' });
    setAttempt((count) => count + 1);
  });
  const submit = (event: FormEvent<HTMLFormElement>, ids: FieldIds): void => {
    event.preventDefault();
    const checked = validatePassword(values);
    setLocalErrors(checked.errors);
    if (checked.input) return fetcher.send({ intent: 'password-change', input: checked.input });
    focusFirst(checked.errors, ids);
  };
  const ownedByField = failure?.kind === 'current_password_invalid';
  const errors: PasswordErrors =
    ownedByField && !localErrors.current
      ? { ...localErrors, current: accountFailureMessage(failure) }
      : localErrors;
  return {
    values,
    errors,
    attempt,
    busy: fetcher.busy,
    alert: ownedByField ? null : failure,
    change,
    submit,
  };
}

function validatePassword(values: PasswordValues): {
  input: ChangePasswordRequestDto | null;
  errors: PasswordErrors;
} {
  const errors: PasswordErrors = {};
  if (values.current === '') errors.current = FIELD_MESSAGES.emptyCurrentPassword;
  if (!newPasswordDto.safeParse(values.next).success) {
    errors.next =
      values.next.length < NEW_PASSWORD_MIN_LENGTH
        ? FIELD_MESSAGES.shortNewPassword
        : FIELD_MESSAGES.longNewPassword;
  } else if (values.confirm !== values.next) {
    errors.confirm = FIELD_MESSAGES.passwordsDiffer;
  }
  if (Object.keys(errors).length > 0) return { input: null, errors };
  return { input: { currentPassword: values.current, newPassword: values.next }, errors };
}

function focusFirst(errors: PasswordErrors, ids: FieldIds): void {
  const first = (['current', 'next', 'confirm'] as const).find((name) => errors[name]);
  if (first) document.getElementById(ids[first])?.focus();
}
