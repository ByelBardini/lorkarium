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
}>;

type LoginValues = { email: string; password: string; rememberMe: boolean };
type FieldErrors = Partial<Record<'email' | 'password', string>>;

type LoginFormState = Readonly<{
  values: LoginValues;
  errors: FieldErrors;
  failure: LoginFailure | null;
  submitting: boolean;
  change: (patch: Partial<LoginValues>) => void;
  submit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  emailRef: RefObject<HTMLInputElement | null>;
  passwordRef: RefObject<HTMLInputElement | null>;
}>;

const FIELD_MESSAGES = {
  emptyEmail: 'Informe seu e-mail.',
  invalidEmail: 'Informe um e-mail válido, como voce@exemplo.com.',
  emptyPassword: 'Informe sua senha.',
  longPassword: `A senha pode ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`,
} as const;

/** Where the login stands: the e-mail and password, or the 2FA code after a right password. */
type LoginStep =
  | Readonly<{ kind: 'credentials'; email: string; notice: string | null; attempt: number }>
  | Readonly<{ kind: 'two-factor'; email: string; attempt: number }>;

const EXPIRED_NOTICE = 'O tempo para o código acabou. Entre de novo.';

/** The login in one or two steps: e-mail + password (validated by the contracts DTO), and, for an
 *  account with 2FA, the app's code or a recovery code. Every refusal is shown.
 *
 *  Example: `<LoginForm authApi={authApi} onAuthenticated={(user) => navigate(next)} />` */
export function LoginForm({ authApi, onAuthenticated }: LoginFormProps): React.JSX.Element {
  const [step, setStep] = useState<LoginStep>({
    kind: 'credentials',
    email: '',
    notice: null,
    attempt: 0,
  });
  const restart = (notice: string | null): void =>
    setStep({ kind: 'credentials', email: step.email, notice, attempt: step.attempt + 1 });
  if (step.kind === 'two-factor') {
    return (
      <TwoFactorStep
        email={step.email}
        authApi={authApi}
        onAuthenticated={onAuthenticated}
        onBack={() => restart(null)}
        onExpired={() => restart(EXPIRED_NOTICE)}
      />
    );
  }
  return (
    <CredentialsForm
      // A new attempt remounts the form: the e-mail stays, the password is typed again.
      key={step.attempt}
      authApi={authApi}
      initialEmail={step.email}
      notice={step.notice}
      onAuthenticated={onAuthenticated}
      onTwoFactor={(email) => setStep({ kind: 'two-factor', email, attempt: step.attempt })}
    />
  );
}

type CredentialsFormProps = LoginFormProps &
  Readonly<{
    initialEmail: string;
    /** Said in the alert before any refusal (the 2FA step timed out). */
    notice: string | null;
    onTwoFactor: (email: string) => void;
  }>;

/** E-mail + password: validates by the contracts DTO, sends once, and shows every refusal. */
function CredentialsForm(props: CredentialsFormProps): React.JSX.Element {
  const { values, errors, failure, submitting, change, submit, emailRef, passwordRef } =
    useLoginForm(props);
  const ids = { email: useId(), password: useId(), remember: useId() };
  const alert = failure ? failureMessage(failure) : props.notice;
  return (
    <form noValidate onSubmit={submit} aria-busy={submitting} className="flex flex-col gap-4.5">
      {alert && (
        <Alert variant="destructive" className="px-3.5 py-3 text-sm">
          {alert}
        </Alert>
      )}
      <FormField id={ids.email} label="E-mail" error={errors.email}>
        <Input
          ref={emailRef}
          id={ids.email}
          type="email"
          autoComplete="username"
          placeholder="seu@email.com"
          value={values.email}
          onChange={(event) => change({ email: event.target.value })}
          aria-invalid={errors.email !== undefined}
          aria-describedby={errors.email ? `${ids.email}-error` : undefined}
        />
      </FormField>
      <FormField id={ids.password} label="Senha" error={errors.password}>
        <PasswordField
          ref={passwordRef}
          id={ids.password}
          autoFocus={props.initialEmail !== ''}
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
  initialEmail,
  onTwoFactor,
}: CredentialsFormProps): LoginFormState {
  const [values, setValues] = useState<LoginValues>({
    email: initialEmail,
    password: '',
    rememberMe: false,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<LoginFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const change = (patch: Partial<LoginValues>): void =>
    setValues((current) => ({ ...current, ...patch }));

  const refuse = (refusal: LoginFailure): void => {
    setFailure(refusal);
    if (refusal.kind !== 'invalid_credentials') return;
    change({ password: '' });
    passwordRef.current?.focus();
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const checked = validateLogin(values);
    setErrors(checked.errors);
    setFailure(null);
    if (!checked.credentials) return focusFirstInvalid(checked.errors, emailRef, passwordRef);
    setSubmitting(true);
    const result = await authApi.login(checked.credentials);
    setSubmitting(false);
    if (result.ok) return onAuthenticated(result.value);
    if (result.failure.kind === 'two_factor_required')
      return onTwoFactor(checked.credentials.email);
    refuse(result.failure);
  };

  return { values, errors, failure, submitting, change, submit, emailRef, passwordRef };
}

function validateLogin(values: LoginValues): {
  credentials: LoginRequestDto | null;
  errors: FieldErrors;
} {
  const parsed = loginRequestDto.safeParse(values);
  if (parsed.success) return { credentials: parsed.data, errors: {} };
  const fields = new Set(parsed.error.issues.map((issue) => issue.path[0]));
  const errors: FieldErrors = {};
  if (fields.has('email')) {
    errors.email =
      values.email.trim() === '' ? FIELD_MESSAGES.emptyEmail : FIELD_MESSAGES.invalidEmail;
  }
  if (fields.has('password')) {
    errors.password =
      values.password === '' ? FIELD_MESSAGES.emptyPassword : FIELD_MESSAGES.longPassword;
  }
  return { credentials: null, errors };
}

function focusFirstInvalid(
  errors: FieldErrors,
  emailRef: RefObject<HTMLInputElement | null>,
  passwordRef: RefObject<HTMLInputElement | null>,
): void {
  const first = errors.email ? emailRef : passwordRef;
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
