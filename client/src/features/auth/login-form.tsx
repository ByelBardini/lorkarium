import {
  loginRequestDto,
  PASSWORD_MAX_LENGTH,
  type AuthUserDto,
  type LoginRequestDto,
} from '@lorkarium/contracts';
import { Loader2Icon } from 'lucide-react';
import { useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import { FormField } from '@/components/form-field';
import { PasswordField } from '@/components/password-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AuthApi, LoginFailure } from '@/services/auth-api';
import { failureMessage } from './login-messages';
import { TwoFactorStep } from './two-factor-step';

export type LoginFormProps = Readonly<{
  authApi: AuthApi;
  onAuthenticated: (user: AuthUserDto) => void;
  /** Whether "Manter conectado" starts checked. */
  rememberByDefault: boolean;
}>;

type LoginValues = { identifier: string; password: string; rememberMe: boolean };
type FieldErrors = Partial<Record<'identifier' | 'password', string>>;

type LoginFormState = Readonly<{
  values: LoginValues;
  errors: FieldErrors;
  failure: LoginFailure | null;
  submitting: boolean;
  change: (patch: Partial<LoginValues>) => void;
  submit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  identifierRef: RefObject<HTMLInputElement | null>;
  passwordRef: RefObject<HTMLInputElement | null>;
}>;

const FIELD_MESSAGES = {
  emptyIdentifier: 'Informe seu e-mail ou usuário.',
  invalidIdentifier: 'Informe um e-mail, como voce@exemplo.com, ou seu usuário, como @bia.',
  emptyPassword: 'Informe sua senha.',
  longPassword: `A senha pode ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`,
} as const;

/** Where the login stands: the e-mail or @ and password, or the 2FA code after a right password. */
type LoginStep =
  | Readonly<{ kind: 'credentials'; identifier: string; notice: string | null; attempt: number }>
  | Readonly<{ kind: 'two-factor'; identifier: string; attempt: number }>;

const EXPIRED_NOTICE = 'O tempo para o código acabou. Entre de novo.';

/** The login in one or two steps: e-mail or @ + password (validated by the contracts DTO), and,
 *  for an account with 2FA, the app's code or a recovery code. Every refusal is shown.
 *
 *  Example: `<LoginForm authApi={authApi} onAuthenticated={(user) => navigate(next)} rememberByDefault={false} />` */
export function LoginForm(props: LoginFormProps): React.JSX.Element {
  const [step, setStep] = useState<LoginStep>({
    kind: 'credentials',
    identifier: '',
    notice: null,
    attempt: 0,
  });
  const restart = (notice: string | null): void =>
    setStep({
      kind: 'credentials',
      identifier: step.identifier,
      notice,
      attempt: step.attempt + 1,
    });
  if (step.kind === 'two-factor') {
    return (
      <TwoFactorStep
        identifier={step.identifier}
        authApi={props.authApi}
        onAuthenticated={props.onAuthenticated}
        onBack={() => restart(null)}
        onExpired={() => restart(EXPIRED_NOTICE)}
      />
    );
  }
  return (
    <CredentialsForm
      // A new attempt remounts the form: the e-mail or @ stays, the password is typed again.
      key={step.attempt}
      {...props}
      initialIdentifier={step.identifier}
      notice={step.notice}
      onTwoFactor={(identifier) =>
        setStep({ kind: 'two-factor', identifier, attempt: step.attempt })
      }
    />
  );
}

type CredentialsFormProps = LoginFormProps &
  Readonly<{
    initialIdentifier: string;
    /** Said in the alert before any refusal (the 2FA step timed out). */
    notice: string | null;
    onTwoFactor: (identifier: string) => void;
  }>;

/** E-mail or @ + password: validates by the contracts DTO, sends once, and shows every refusal. */
function CredentialsForm(props: CredentialsFormProps): React.JSX.Element {
  const { values, errors, failure, submitting, change, submit, identifierRef, passwordRef } =
    useLoginForm(props);
  const ids = { identifier: useId(), password: useId(), remember: useId() };
  const alert = failure ? failureMessage(failure) : props.notice;
  return (
    <form noValidate onSubmit={submit} aria-busy={submitting} className="flex flex-col gap-4.5">
      {alert && (
        <Alert variant="destructive" className="px-3.5 py-3 text-sm">
          {alert}
        </Alert>
      )}
      <FormField id={ids.identifier} label="E-mail ou usuário" error={errors.identifier}>
        <Input
          ref={identifierRef}
          id={ids.identifier}
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="voce@exemplo.com ou @usuario"
          value={values.identifier}
          onChange={(event) => change({ identifier: event.target.value })}
          aria-invalid={errors.identifier !== undefined}
          aria-describedby={errors.identifier ? `${ids.identifier}-error` : undefined}
        />
      </FormField>
      <FormField id={ids.password} label="Senha" error={errors.password}>
        <PasswordField
          ref={passwordRef}
          id={ids.password}
          autoFocus={props.initialIdentifier !== ''}
          value={values.password}
          onValueChange={(password) => change({ password })}
          invalid={errors.password !== undefined}
          describedBy={errors.password ? `${ids.password}-error` : undefined}
        />
      </FormField>
      <RememberMe
        id={ids.remember}
        checked={values.rememberMe}
        onChange={(rememberMe) => change({ rememberMe })}
      />
      <SubmitButton submitting={submitting} />
    </form>
  );
}

function useLoginForm({
  authApi,
  onAuthenticated,
  rememberByDefault,
  initialIdentifier,
  onTwoFactor,
}: CredentialsFormProps): LoginFormState {
  const [values, setValues] = useState<LoginValues>({
    identifier: initialIdentifier,
    password: '',
    rememberMe: rememberByDefault,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<LoginFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const change = (patch: Partial<LoginValues>): void =>
    setValues((current) => ({ ...current, ...patch }));

  const refuse = (refusal: LoginFailure): void => {
    setFailure(refusal);
    if (refusal.kind !== 'invalid_credentials' && refusal.kind !== 'account_suspended') return;
    change({ password: '' });
    passwordRef.current?.focus();
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const checked = validateLogin(values);
    setErrors(checked.errors);
    setFailure(null);
    if (!checked.credentials) return focusFirstInvalid(checked.errors, identifierRef, passwordRef);
    setSubmitting(true);
    const result = await authApi.login(checked.credentials);
    setSubmitting(false);
    if (result.ok) return onAuthenticated(result.value);
    if (result.failure.kind === 'two_factor_required')
      return onTwoFactor(checked.credentials.identifier);
    refuse(result.failure);
  };

  return { values, errors, failure, submitting, change, submit, identifierRef, passwordRef };
}

function validateLogin(values: LoginValues): {
  credentials: LoginRequestDto | null;
  errors: FieldErrors;
} {
  const parsed = loginRequestDto.safeParse(values);
  if (parsed.success) return { credentials: parsed.data, errors: {} };
  const fields = new Set(parsed.error.issues.map((issue) => issue.path[0]));
  const errors: FieldErrors = {};
  if (fields.has('identifier')) {
    errors.identifier =
      values.identifier.trim() === ''
        ? FIELD_MESSAGES.emptyIdentifier
        : FIELD_MESSAGES.invalidIdentifier;
  }
  if (fields.has('password')) {
    errors.password =
      values.password === '' ? FIELD_MESSAGES.emptyPassword : FIELD_MESSAGES.longPassword;
  }
  return { credentials: null, errors };
}

function focusFirstInvalid(
  errors: FieldErrors,
  identifierRef: RefObject<HTMLInputElement | null>,
  passwordRef: RefObject<HTMLInputElement | null>,
): void {
  const first = errors.identifier ? identifierRef : passwordRef;
  first.current?.focus();
}

function RememberMe({
  id,
  checked,
  onChange,
}: Readonly<{
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}>): React.JSX.Element {
  return (
    <div className="flex min-h-6 items-center gap-2.5">
      <Checkbox id={id} checked={checked} onCheckedChange={(state) => onChange(state === true)} />
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal text-muted-foreground">
        Manter conectado
      </Label>
    </div>
  );
}

function SubmitButton({ submitting }: Readonly<{ submitting: boolean }>): React.JSX.Element {
  return (
    <Button type="submit" size="xl" disabled={submitting} className="mt-1">
      {submitting && <Loader2Icon aria-hidden="true" className="animate-spin" />}
      {submitting ? 'Entrando…' : 'Entrar'}
    </Button>
  );
}
