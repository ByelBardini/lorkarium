import { newPasswordDto } from '@lorkarium/contracts';
import { Loader2Icon } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { FormField } from '@/components/form-field';
import { PasswordField } from '@/components/password-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { AccountRecoveryView } from '@/services/account-security-api';
import type { AccountRecoveryIntent, AccountRecoveryResult } from './account-recovery-action';
import { FIELD_MESSAGES } from './account-messages';
import { recoveryFailureMessage } from './account-recovery-messages';

export type AccountRecoveryFormProps = Readonly<{
  token: string;
  recovery: AccountRecoveryView;
  heading: React.ReactNode;
  /** Shown instead of the form once the account is recovered. */
  onRecovered: React.ReactNode;
  /** Shown instead of the form when the link died meanwhile. */
  onInvalid: React.ReactNode;
}>;

/** What the link will undo, the new password and the button; validated by `newPasswordDto`
 *  before any request.
 *
 *  Example: `<AccountRecoveryForm token={token} recovery={recovery} heading={…} onRecovered={…} onInvalid={…} />` */
export function AccountRecoveryForm(props: AccountRecoveryFormProps): React.JSX.Element {
  const fetcher = useFetcher<AccountRecoveryResult>();
  const busy = fetcher.state !== 'idle';
  const result = busy ? undefined : fetcher.data;
  const failure = result && 'failure' in result ? result.failure : null;
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  if (result && 'recovered' in result) return <>{props.onRecovered}</>;
  if (failure?.kind === 'recovery_token_invalid') return <>{props.onInvalid}</>;
  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const parsed = newPasswordDto.safeParse(password);
    if (!parsed.success) {
      setError(
        password.length > 256 ? FIELD_MESSAGES.longNewPassword : FIELD_MESSAGES.shortNewPassword,
      );
      input.current?.focus();
      return;
    }
    setError(undefined);
    const intent: AccountRecoveryIntent = {
      intent: 'recover',
      token: props.token,
      newPassword: parsed.data,
    };
    void fetcher.submit(intent, { method: 'post', encType: 'application/json' });
  };
  return (
    <form
      noValidate
      onSubmit={submit}
      aria-busy={busy}
      className="flex w-full max-w-md flex-col items-start gap-5"
    >
      {props.heading}
      <p className="text-muted-foreground">{explanationOf(props.recovery)}</p>
      <div className="w-full">
        <FormField id={id} label="Senha nova" error={error}>
          <PasswordField
            ref={input}
            id={id}
            value={password}
            onValueChange={setPassword}
            invalid={error !== undefined}
            describedBy={error ? `${id}-error` : undefined}
            autoComplete="new-password"
            autoFocus
          />
        </FormField>
      </div>
      {failure && (
        <Alert variant="destructive" className="w-full px-3.5 py-3 text-sm">
          {recoveryFailureMessage(failure)}
        </Alert>
      )}
      <Button type="submit" size="xl" disabled={busy}>
        {busy && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {busy ? 'Recuperando…' : 'Recuperar conta'}
      </Button>
    </form>
  );
}

const ALL_OUT = 'Todos os aparelhos saem da conta, e você entra de novo com a senha nova.';

function explanationOf(recovery: AccountRecoveryView): string {
  if (recovery.kind === 'cancel-email-change') {
    const target = recovery.email ? ` para ${recovery.email}` : '';
    return `A troca de e-mail${target} é cancelada. ${ALL_OUT}`;
  }
  if (recovery.kind === 'revert-email-change') {
    return `A conta volta a usar o e-mail antigo. ${ALL_OUT}`;
  }
  return `Escolha uma senha nova para tirar quem trocou a sua. ${ALL_OUT}`;
}
