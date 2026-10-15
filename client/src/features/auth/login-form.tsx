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
import type { AuthApi, AuthFailure } from '@/services/auth-api';

export type LoginFormProps = Readonly<{
  authApi: AuthApi;
  onAuthenticated: (user: AuthUserDto) => void;
}>;

type LoginValues = { email: string; password: string; rememberMe: boolean };
type FieldErrors = Partial<Record<'email' | 'password', string>>;

type LoginFormState = Readonly<{
  values: LoginValues;
  errors: FieldErrors;
  failure: AuthFailure | null;
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

/** E-mail + password form: validates by the contracts DTO, sends once, and shows every refusal.
 *
 *  Example: `<LoginForm authApi={authApi} onAuthenticated={(user) => navigate(next)} />` */
export function LoginForm({ authApi, onAuthenticated }: LoginFormProps): React.JSX.Element {
  const { values, errors, failure, submitting, change, submit, emailRef, passwordRef } =
    useLoginForm(authApi, onAuthenticated);
  const ids = { email: useId(), password: useId(), remember: useId() };
  return (
    <form noValidate onSubmit={submit} aria-busy={submitting} className="flex flex-col gap-4.5">
      {failure && (
        <Alert variant="destructive" className="px-3.5 py-3 text-sm">
          {failureMessage(failure)}
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

function useLoginForm(
  authApi: AuthApi,
  onAuthenticated: (user: AuthUserDto) => void,
): LoginFormState {
  const [values, setValues] = useState<LoginValues>({ email: '', password: '', rememberMe: false });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const change = (patch: Partial<LoginValues>): void =>
    setValues((current) => ({ ...current, ...patch }));

  const refuse = (refusal: AuthFailure): void => {
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
    if (result.ok) onAuthenticated(result.value);
    else refuse(result.failure);
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

function failureMessage(failure: AuthFailure): string {
  switch (failure.kind) {
    case 'invalid_credentials':
      return 'E-mail ou senha incorretos.';
    case 'rate_limited':
      return `Muitas tentativas. Tente de novo em ${failure.retryAfterSeconds} s.`;
    case 'offline':
      return 'Sem conexão com o servidor. Confira sua internet e tente de novo.';
    case 'unexpected':
      return 'Algo deu errado do nosso lado. Tente de novo em instantes.';
  }
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
