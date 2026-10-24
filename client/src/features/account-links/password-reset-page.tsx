import { Loader2Icon } from 'lucide-react';
import { useId, useState } from 'react';
import { Link, useFetcher } from 'react-router';
import { FormField } from '@/components/form-field';
import { PasswordField } from '@/components/password-field';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { AuthFrame } from '@/features/auth/auth-frame';
import { useOnceOnMount } from '@/lib/use-once-on-mount';
import { useFragmentToken } from '@/lib/use-fragment-token';
import type { AccountLinksActionResult, AccountLinksIntent } from './account-links-action';
import { linkFailureMessage, passwordProblems, RESET_LINK_DEAD } from './account-links-messages';

/** The page of the new-password link an admin sent (`/reset-password#token=…`): whose account, the
 *  new password twice, and then the login (every session of the account fell).
 *
 *  Example: `<PasswordResetPage />` */
export function PasswordResetPage(): React.JSX.Element {
  const token = useFragmentToken();
  const inspect = useFetcher<AccountLinksActionResult>();
  useOnceOnMount(() => {
    if (!token) return;
    const intent: AccountLinksIntent = { intent: 'inspect-reset', token };
    void inspect.submit(intent, { method: 'post', encType: 'application/json' });
  });
  const result = inspect.state === 'idle' ? inspect.data : undefined;
  const username = result && 'username' in result ? result.username : null;
  const dead = <p className="text-[15px] text-muted-foreground">{RESET_LINK_DEAD}</p>;
  const heading = username ? `Nova senha para @${username}` : 'Nova senha';
  return (
    <AuthFrame pageTitle="Lorkarium · Nova senha" heading={heading}>
      {!token || (result && 'failure' in result && result.failure.kind === 'link_invalid') ? (
        dead
      ) : result && 'failure' in result ? (
        <Alert variant="destructive" className="px-3.5 py-3 text-sm">
          {linkFailureMessage(result.failure)}
        </Alert>
      ) : !username ? (
        <p role="status" className="text-muted-foreground">
          Conferindo o link…
        </p>
      ) : (
        <NewPasswordForm token={token} deadLink={dead} />
      )}
    </AuthFrame>
  );
}

function NewPasswordForm({
  token,
  deadLink,
}: Readonly<{ token: string; deadLink: React.ReactNode }>): React.JSX.Element {
  const ids = { password: useId(), repeated: useId() };
  const fetcher = useFetcher<AccountLinksActionResult>();
  const busy = fetcher.state !== 'idle';
  const settled = busy ? undefined : fetcher.data;
  const [password, setPassword] = useState('');
  const [repeated, setRepeated] = useState('');
  const [errors, setErrors] = useState<ReturnType<typeof passwordProblems>>({});
  if (settled && 'done' in settled) return <ChangedNotice />;
  const failure = settled && 'failure' in settled ? settled.failure : null;
  if (failure?.kind === 'link_invalid') return <>{deadLink}</>;
  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const found = passwordProblems(password, repeated);
    setErrors(found);
    if (found.password || found.repeated) {
      document.getElementById(found.password ? ids.password : ids.repeated)?.focus();
      return;
    }
    const intent: AccountLinksIntent = { intent: 'complete-reset', token, newPassword: password };
    void fetcher.submit(intent, { method: 'post', encType: 'application/json' });
  };
  return (
    <form noValidate onSubmit={submit} aria-busy={busy} className="flex flex-col gap-5">
      <FormField id={ids.password} label="Senha nova" error={errors.password}>
        <PasswordField
          id={ids.password}
          value={password}
          onValueChange={setPassword}
          invalid={errors.password !== undefined}
          describedBy={errors.password ? `${ids.password}-error` : undefined}
          autoComplete="new-password"
          autoFocus
        />
      </FormField>
      <FormField id={ids.repeated} label="Repita a senha nova" error={errors.repeated}>
        <PasswordField
          id={ids.repeated}
          value={repeated}
          onValueChange={setRepeated}
          invalid={errors.repeated !== undefined}
          describedBy={errors.repeated ? `${ids.repeated}-error` : undefined}
          autoComplete="new-password"
        />
      </FormField>
      {failure && (
        <Alert variant="destructive" className="px-3.5 py-3 text-sm">
          {linkFailureMessage(failure)}
        </Alert>
      )}
      <Button type="submit" size="xl" disabled={busy}>
        {busy && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {busy ? 'Trocando…' : 'Trocar senha'}
      </Button>
    </form>
  );
}

function ChangedNotice(): React.JSX.Element {
  return (
    <div className="flex flex-col items-start gap-4">
      <p role="status" className="text-[15px]">
        Senha trocada. Entre com a nova senha.
      </p>
      <Link to="/login" className={buttonVariants({ size: 'xl' })}>
        Entrar
      </Link>
    </div>
  );
}
