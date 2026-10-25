import {
  recoveryCodeDto,
  totpCodeDto,
  type AuthUserDto,
  type TwoFactorLoginRequestDto,
} from '@lorkarium/contracts';
import { ArrowLeftIcon, Loader2Icon } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { FormField } from '@/components/form-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AuthApi, TwoFactorLoginFailure } from '@/services/auth-api';
import { failureMessage, signInNameOf } from './login-messages';

type CodeMode = 'app' | 'recovery';

const MODE_TEXT: Readonly<Record<CodeMode, { label: string; invalid: string; toggle: string }>> = {
  app: {
    label: 'Código do app autenticador',
    invalid: 'O código tem 6 números.',
    toggle: 'Usar um código de recuperação',
  },
  recovery: {
    label: 'Código de recuperação',
    invalid: 'O código de recuperação tem o formato xxxxx-xxxxx.',
    toggle: 'Usar o código do app',
  },
};

const WRONG_CODE = 'Código incorreto.';

export type TwoFactorStepProps = Readonly<{
  /** The e-mail or @ of the first step, as parsed by `loginIdentifierDto`. */
  identifier: string;
  authApi: AuthApi;
  onAuthenticated: (user: AuthUserDto) => void;
  /** "Voltar": the e-mail or @ and password again. */
  onBack: () => void;
  /** The challenge is gone (5 min or 5 wrong codes): the login starts over. */
  onExpired: () => void;
}>;

/** The second step of the login for an account with 2FA: the app's code, or a recovery code.
 *  A wrong code is cleared and focused; a challenge that expired sends back to the first step.
 *
 *  Example: `<TwoFactorStep identifier="ana@mesa.com" authApi={authApi} onAuthenticated={enter} onBack={back} onExpired={restart} />` */
export function TwoFactorStep(props: TwoFactorStepProps): React.JSX.Element {
  const step = useTwoFactorStep(props);
  const id = useId();
  const text = MODE_TEXT[step.mode];
  return (
    <form
      noValidate
      aria-label="Verificação em duas etapas"
      aria-busy={step.submitting}
      onSubmit={step.submit}
      className="flex flex-col gap-4.5"
    >
      <p className="text-sm text-muted-foreground">
        Entrando como <span className="text-foreground">{signInNameOf(props.identifier)}</span>
      </p>
      {step.failure && (
        <Alert variant="destructive" className="px-3.5 py-3 text-sm">
          {failureMessage(step.failure)}
        </Alert>
      )}
      <FormField id={id} label={text.label} error={step.error ?? undefined}>
        <Input
          key={`${step.mode}-${step.attempt}`}
          id={id}
          autoFocus
          inputMode={step.mode === 'app' ? 'numeric' : 'text'}
          autoComplete="one-time-code"
          spellCheck={false}
          placeholder={step.mode === 'app' ? '123456' : 'xxxxx-xxxxx'}
          value={step.code}
          onChange={(event) => step.setCode(event.target.value)}
          aria-invalid={step.error !== null}
          aria-describedby={step.error ? `${id}-error` : undefined}
        />
      </FormField>
      <Button type="button" variant="link" className="self-start px-0" onClick={step.toggleMode}>
        {text.toggle}
      </Button>
      <Button type="submit" size="xl" disabled={step.submitting}>
        {step.submitting && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {step.submitting ? 'Conferindo…' : 'Entrar'}
      </Button>
      <Button type="button" variant="outline" size="xl" onClick={props.onBack}>
        <ArrowLeftIcon aria-hidden="true" />
        Voltar
      </Button>
    </form>
  );
}

type TwoFactorStepState = Readonly<{
  mode: CodeMode;
  code: string;
  error: string | null;
  failure: TwoFactorLoginFailure | null;
  submitting: boolean;
  attempt: number;
  setCode: (code: string) => void;
  toggleMode: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}>;

function useTwoFactorStep(props: TwoFactorStepProps): TwoFactorStepState {
  const [mode, setMode] = useState<CodeMode>('app');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<TwoFactorLoginFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const refuse = (refusal: TwoFactorLoginFailure): void => {
    if (refusal.kind === 'two_factor_challenge_expired') return props.onExpired();
    if (refusal.kind !== 'two_factor_code_invalid') return setFailure(refusal);
    setCode('');
    setError(WRONG_CODE);
    setAttempt((count) => count + 1);
  };
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const input = loginCodeOf(code, mode);
    setError(input ? null : MODE_TEXT[mode].invalid);
    setFailure(null);
    // A wrong format remounts the field focused, with what was typed still in it.
    if (!input) return setAttempt((count) => count + 1);
    setSubmitting(true);
    const result = await props.authApi.verifyTwoFactor(input);
    setSubmitting(false);
    if (result.ok) props.onAuthenticated(result.value);
    else refuse(result.failure);
  };
  const toggleMode = (): void => {
    setMode((now) => (now === 'app' ? 'recovery' : 'app'));
    setCode('');
    setError(null);
  };
  return { mode, code, error, failure, submitting, attempt, setCode, toggleMode, submit };
}

function loginCodeOf(code: string, mode: CodeMode): TwoFactorLoginRequestDto | null {
  if (mode === 'app') {
    const parsed = totpCodeDto.safeParse(code);
    return parsed.success ? { code: parsed.data } : null;
  }
  const parsed = recoveryCodeDto.safeParse(code);
  return parsed.success ? { recoveryCode: parsed.data } : null;
}
