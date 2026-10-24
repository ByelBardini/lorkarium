import { recoveryCodeDto, totpCodeDto } from '@lorkarium/contracts';
import { useId, useState, type FormEvent } from 'react';
import { FormField } from '@/components/form-field';
import { PasswordField } from '@/components/password-field';
import { Input } from '@/components/ui/input';
import { DialogButtons, DialogFailure } from './account-dialog';
import { FIELD_MESSAGES, accountFailureMessage, type AccountFailure } from './account-messages';

/** Which code the form asks: the app's 6 digits, or that or a recovery code. */
export type TwoFactorCodeKind = 'totp' | 'any';

/** The values the form hands over, already normalized (the code without spaces, lower case). */
export type TwoFactorFormValues = Readonly<{ currentPassword: string; code: string }>;

export type TwoFactorFormProps = Readonly<{
  label: string;
  askPassword: boolean;
  code: TwoFactorCodeKind | null;
  submitLabel: string;
  busyLabel: string;
  busy: boolean;
  failure: AccountFailure | null;
  onSubmit: (values: TwoFactorFormValues) => void;
  onCancel: () => void;
}>;

type FieldName = 'password' | 'code';
type FormErrors = Partial<Record<FieldName, string>>;

const FIELD_OF_FAILURE: Partial<Record<AccountFailure['kind'], FieldName>> = {
  current_password_invalid: 'password',
  two_factor_code_invalid: 'code',
};

/** The password and/or code form of the 2FA dialogs. A refusal of the password or of the code
 *  clears that field, focuses it and says why under it; any other refusal is the alert.
 *
 *  Example: `<TwoFactorForm label="Desligar 2FA" askPassword code="any" … onSubmit={send} />` */
export function TwoFactorForm(props: TwoFactorFormProps): React.JSX.Element {
  const form = useTwoFactorForm(props);
  const ids = { password: useId(), code: useId() };
  const { errors } = form;
  return (
    <form
      noValidate
      aria-label={props.label}
      aria-busy={props.busy}
      onSubmit={(event) => form.submit(event, ids)}
      className="flex flex-col gap-4"
    >
      <DialogFailure failure={form.alert} />
      {props.askPassword && (
        <FormField id={ids.password} label="Senha atual" error={errors.password}>
          <PasswordField
            key={`password-${form.attempts.password}`}
            autoFocus={form.attempts.password > 0}
            id={ids.password}
            value={form.values.password}
            onValueChange={(password) => form.change({ password })}
            invalid={errors.password !== undefined}
            describedBy={errors.password ? `${ids.password}-error` : undefined}
          />
        </FormField>
      )}
      {props.code && (
        <FormField
          id={ids.code}
          label={props.code === 'totp' ? 'Código do app' : 'Código do app ou de recuperação'}
          error={errors.code}
        >
          <Input
            key={`code-${form.attempts.code}`}
            autoFocus={form.attempts.code > 0 || !props.askPassword}
            id={ids.code}
            inputMode={props.code === 'totp' ? 'numeric' : 'text'}
            autoComplete="one-time-code"
            spellCheck={false}
            placeholder={props.code === 'totp' ? '123456' : '123456 ou xxxxx-xxxxx'}
            value={form.values.code}
            onChange={(event) => form.change({ code: event.target.value })}
            aria-invalid={errors.code !== undefined}
            aria-describedby={errors.code ? `${ids.code}-error` : undefined}
          />
        </FormField>
      )}
      <DialogButtons
        busy={props.busy}
        submitLabel={props.submitLabel}
        busyLabel={props.busyLabel}
        onCancel={props.onCancel}
      />
    </form>
  );
}

type FormValues = { password: string; code: string };

type TwoFactorFormState = Readonly<{
  values: FormValues;
  errors: FormErrors;
  attempts: Readonly<Record<FieldName, number>>;
  alert: AccountFailure | null;
  change: (patch: Partial<FormValues>) => void;
  submit: (event: FormEvent<HTMLFormElement>, ids: Record<FieldName, string>) => void;
}>;

function useTwoFactorForm(props: TwoFactorFormProps): TwoFactorFormState {
  const [values, setValues] = useState<FormValues>({ password: '', code: '' });
  const [localErrors, setLocalErrors] = useState<FormErrors>({});
  const [attempts, setAttempts] = useState({ password: 0, code: 0 });
  const [seenFailure, setSeenFailure] = useState(props.failure);
  const field = props.failure ? FIELD_OF_FAILURE[props.failure.kind] : undefined;
  // A new refusal of a field empties it and remounts it focused (the "seen" pattern of the home).
  if (props.failure !== seenFailure) {
    setSeenFailure(props.failure);
    if (field) {
      setValues((now) => ({ ...now, [field]: '' }));
      setAttempts((now) => ({ ...now, [field]: now[field] + 1 }));
    }
  }
  const change = (patch: Partial<FormValues>): void => setValues((now) => ({ ...now, ...patch }));
  const submit = (event: FormEvent<HTMLFormElement>, ids: Record<FieldName, string>): void => {
    event.preventDefault();
    const checked = checkTwoFactor(values, props);
    setLocalErrors(checked.errors);
    if (checked.values) return props.onSubmit(checked.values);
    document.getElementById(checked.errors.password ? ids.password : ids.code)?.focus();
  };
  const serverErrors: FormErrors =
    props.failure && field ? { [field]: accountFailureMessage(props.failure) } : {};
  return {
    values,
    errors: { ...serverErrors, ...localErrors },
    attempts,
    alert: field ? null : props.failure,
    change,
    submit,
  };
}

function checkTwoFactor(
  values: FormValues,
  props: Pick<TwoFactorFormProps, 'askPassword' | 'code'>,
): { values: TwoFactorFormValues | null; errors: FormErrors } {
  const errors: FormErrors = {};
  if (props.askPassword && values.password === '')
    errors.password = FIELD_MESSAGES.emptyCurrentPassword;
  const code = props.code ? normalizedCode(values.code, props.code) : '';
  if (code === null)
    errors.code = props.code === 'totp' ? FIELD_MESSAGES.invalidTotp : FIELD_MESSAGES.invalidCode;
  if (code === null || errors.password) return { values: null, errors };
  return { values: { currentPassword: values.password, code }, errors };
}

function normalizedCode(code: string, kind: TwoFactorCodeKind): string | null {
  const totp = totpCodeDto.safeParse(code);
  if (totp.success) return totp.data;
  if (kind === 'totp') return null;
  const recovery = recoveryCodeDto.safeParse(code);
  return recovery.success ? recovery.data : null;
}
