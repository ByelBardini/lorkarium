import { changeEmailRequestDto, type ChangeEmailRequestDto } from '@lorkarium/contracts';
import { useId, useState, type FormEvent } from 'react';
import { FormField } from '@/components/form-field';
import { PasswordField } from '@/components/password-field';
import { Input } from '@/components/ui/input';
import { AccountDialog, DialogButtons, DialogFailure } from './account-dialog';
import { FIELD_MESSAGES, accountFailureMessage, type AccountFailure } from './account-messages';
import { failureOf, useAccountFetcher, useOnSettled } from './use-account-fetcher';

type EmailValues = { newEmail: string; password: string };
type EmailErrors = Partial<Record<keyof EmailValues, string>>;

// The refusals a field owns; the rest go to the alert.
const FIELD_OF_FAILURE: Partial<Record<AccountFailure['kind'], keyof EmailValues>> = {
  email_taken: 'newEmail',
  email_unchanged: 'newEmail',
  current_password_invalid: 'password',
};

export type ChangeEmailDialogProps = Readonly<{
  onClose: () => void;
  /** The link went to the new address; the change waits for its click. */
  onRequested: () => void;
}>;

/** "Trocar e-mail": the new address and the current password. Nothing changes until the link sent
 *  to the new address is clicked; the old one is warned.
 *
 *  Example: `{dialog === 'email' && <ChangeEmailDialog onClose={close} onRequested={announce} />}` */
export function ChangeEmailDialog({
  onClose,
  onRequested,
}: ChangeEmailDialogProps): React.JSX.Element {
  const form = useEmailForm(onRequested);
  const ids = { newEmail: useId(), password: useId() };
  const { values, errors } = form;
  return (
    <AccountDialog
      title="Trocar e-mail"
      description="Enviamos um link para o novo endereço. A troca só vale depois do clique."
      onClose={onClose}
    >
      <form
        noValidate
        aria-label="Trocar e-mail"
        aria-busy={form.busy}
        onSubmit={(event) => form.submit(event, ids)}
        className="flex flex-col gap-4"
      >
        <DialogFailure failure={form.alert} />
        <FormField id={ids.newEmail} label="Novo e-mail" error={errors.newEmail}>
          <Input
            id={ids.newEmail}
            type="email"
            autoComplete="email"
            value={values.newEmail}
            onChange={(event) => form.change({ newEmail: event.target.value })}
            aria-invalid={errors.newEmail !== undefined}
            aria-describedby={errors.newEmail ? `${ids.newEmail}-error` : undefined}
          />
        </FormField>
        <FormField id={ids.password} label="Senha atual" error={errors.password}>
          <PasswordField
            key={form.attempt}
            autoFocus={form.attempt > 0}
            id={ids.password}
            value={values.password}
            onValueChange={(password) => form.change({ password })}
            invalid={errors.password !== undefined}
            describedBy={errors.password ? `${ids.password}-error` : undefined}
          />
        </FormField>
        <DialogButtons
          busy={form.busy}
          submitLabel="Enviar link"
          busyLabel="Enviando…"
          onCancel={onClose}
        />
      </form>
    </AccountDialog>
  );
}

type FieldIds = Record<keyof EmailValues, string>;

type EmailForm = Readonly<{
  values: EmailValues;
  errors: EmailErrors;
  attempt: number;
  busy: boolean;
  alert: AccountFailure | null;
  change: (patch: Partial<EmailValues>) => void;
  submit: (event: FormEvent<HTMLFormElement>, ids: FieldIds) => void;
}>;

function useEmailForm(onRequested: () => void): EmailForm {
  const fetcher = useAccountFetcher();
  const [values, setValues] = useState<EmailValues>({ newEmail: '', password: '' });
  const [localErrors, setLocalErrors] = useState<EmailErrors>({});
  const [attempt, setAttempt] = useState(0);
  const failure = failureOf(fetcher.settled);
  const change = (patch: Partial<EmailValues>): void => setValues((now) => ({ ...now, ...patch }));
  useOnSettled(fetcher.settled, (result) => {
    if ('pendingEmail' in result) return onRequested();
    if (!('failure' in result) || result.failure.kind !== 'current_password_invalid') return;
    change({ password: '' });
    setAttempt((count) => count + 1);
  });
  const submit = (event: FormEvent<HTMLFormElement>, ids: FieldIds): void => {
    event.preventDefault();
    const checked = validateEmail(values);
    setLocalErrors(checked.errors);
    if (checked.input) return fetcher.send({ intent: 'email-change', input: checked.input });
    const first = checked.errors.newEmail ? ids.newEmail : ids.password;
    document.getElementById(first)?.focus();
  };
  const field = failure ? FIELD_OF_FAILURE[failure.kind] : undefined;
  const errors =
    failure && field ? { [field]: accountFailureMessage(failure), ...localErrors } : localErrors;
  return {
    values,
    errors,
    attempt,
    busy: fetcher.busy,
    alert: field ? null : failure,
    change,
    submit,
  };
}

function validateEmail(values: EmailValues): {
  input: ChangeEmailRequestDto | null;
  errors: EmailErrors;
} {
  const parsed = changeEmailRequestDto.safeParse({
    newEmail: values.newEmail,
    currentPassword: values.password,
  });
  if (parsed.success) return { input: parsed.data, errors: {} };
  const fields = new Set(parsed.error.issues.map((issue) => issue.path[0]));
  const errors: EmailErrors = {};
  if (fields.has('newEmail')) {
    errors.newEmail =
      values.newEmail.trim() === '' ? FIELD_MESSAGES.emptyEmail : FIELD_MESSAGES.invalidEmail;
  }
  if (fields.has('currentPassword')) errors.password = FIELD_MESSAGES.emptyCurrentPassword;
  return { input: null, errors };
}
