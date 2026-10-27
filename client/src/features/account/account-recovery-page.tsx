import { useEffect } from 'react';
import { Link, useFetcher } from 'react-router';
import { BrandMark } from '@/components/brand-mark';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { useFragmentToken } from '@/lib/use-fragment-token';
import type { AccountRecoveryView } from '@/services/account-security-api';
import type { AccountRecoveryIntent, AccountRecoveryResult } from './account-recovery-action';
import { AccountRecoveryForm } from './account-recovery-form';
import { recoveryFailureMessage } from './account-recovery-messages';

const INVALID_LINK = 'Esse link venceu ou já foi usado.';

/** The page of the "Não fui eu" link (`/account/recover#token=…`): checks the link, says what it
 *  will undo and recovers the account with a new password, signing every device out.
 *
 *  Example: `<AccountRecoveryPage />` */
export function AccountRecoveryPage(): React.JSX.Element {
  const token = useFragmentToken();
  const check = useRecoveryCheck(token);
  return (
    <main className="flex min-h-app w-full flex-col items-start gap-8 bg-background px-4 py-12 sm:px-8 lg:px-12">
      <title>Lorkarium · Recuperar conta</title>
      <BrandMark variant="compact" />
      <RecoveryBody token={token} check={check} />
    </main>
  );
}

type CheckState =
  | Readonly<{ kind: 'checking' }>
  | Readonly<{ kind: 'ready'; recovery: AccountRecoveryView }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'failed'; result: AccountRecoveryResult }>;

function useRecoveryCheck(token: string | null): CheckState {
  const fetcher = useFetcher<AccountRecoveryResult>();
  const { submit } = fetcher;
  useEffect(() => {
    if (!token) return;
    const intent: AccountRecoveryIntent = { intent: 'check', token };
    void submit(intent, { method: 'post', encType: 'application/json' });
  }, [token, submit]);
  const result = fetcher.state === 'idle' ? fetcher.data : undefined;
  if (!token) return { kind: 'invalid' };
  if (!result) return { kind: 'checking' };
  if ('recovery' in result) return { kind: 'ready', recovery: result.recovery };
  if ('failure' in result && result.failure.kind === 'recovery_token_invalid') {
    return { kind: 'invalid' };
  }
  return { kind: 'failed', result };
}

function RecoveryBody({
  token,
  check,
}: Readonly<{ token: string | null; check: CheckState }>): React.JSX.Element {
  if (check.kind === 'checking') {
    return <p role="status">Conferindo o link…</p>;
  }
  if (check.kind === 'failed' && 'failure' in check.result) {
    return (
      <Alert variant="destructive" className="max-w-md px-3.5 py-3 text-sm">
        {recoveryFailureMessage(check.result.failure)}
      </Alert>
    );
  }
  if (check.kind !== 'ready' || !token) return <RecoveryHeading text={INVALID_LINK} />;
  return (
    <AccountRecoveryForm
      token={token}
      recovery={check.recovery}
      heading={<RecoveryHeading text={headingOf(check.recovery)} />}
      onRecovered={<RecoveredNotice />}
      onInvalid={<RecoveryHeading text={INVALID_LINK} />}
    />
  );
}

function headingOf(recovery: AccountRecoveryView): string {
  if (recovery.kind === 'cancel-email-change') return 'Cancelar a troca de e-mail';
  if (recovery.kind === 'revert-email-change') {
    return `Voltar o e-mail da conta para ${recovery.email ?? 'o endereço antigo'}`;
  }
  return 'Recuperar sua conta';
}

function RecoveryHeading({ text }: Readonly<{ text: string }>): React.JSX.Element {
  return <h1 className="max-w-prose font-display text-[32px] font-semibold">{text}</h1>;
}

function RecoveredNotice(): React.JSX.Element {
  return (
    <div className="flex flex-col items-start gap-4">
      <RecoveryHeading text="Pronto." />
      <p role="status" className="text-muted-foreground">
        Todos os aparelhos saíram da conta. Entre com a senha nova.
      </p>
      <Link to="/login" className={buttonVariants({ size: 'xl' })}>
        Entrar
      </Link>
    </div>
  );
}
