import type { AccountSecurityDto, AccountSessionDto } from '@lorkarium/contracts';
import { useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { sinceLabel } from '@/lib/since-label';
import type { Clipboard } from '@/services/clipboard';
import { accountFailureMessage } from './account-messages';
import { ChangeEmailDialog } from './change-email-dialog';
import { ChangePasswordDialog } from './change-password-dialog';
import { SectionHeading } from './section-heading';
import { SecurityRow, type SecurityDialog } from './security-row';
import { SessionsList } from './sessions-list';
import { RecoveryCodesRegenerateDialog, TwoFactorDisableDialog } from './two-factor-disable-dialog';
import { TwoFactorRow } from './two-factor-row';
import { TwoFactorSetupDialog } from './two-factor-setup-dialog';
import { failureOf, useAccountFetcher, useOnSettled } from './use-account-fetcher';

export type SecuritySectionProps = Readonly<{
  security: AccountSecurityDto;
  sessions: readonly AccountSessionDto[];
  username: string;
  now: Date;
  clipboard: Clipboard;
}>;

/** "Conta e segurança": e-mail (with the pending change), password ("Trocada há N"), 2FA and the
 *  signed-in devices. What each command did is said once in the section's status line.
 *
 *  Example: `<SecuritySection security={security} sessions={sessions} username="ana" now={now} clipboard={clipboard} />` */
export function SecuritySection(props: SecuritySectionProps): React.JSX.Element {
  const [dialog, setDialog] = useState<SecurityDialog | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const titleId = useId();
  const close = (): void => setDialog(null);
  const done = (message: string) => (): void => {
    setDialog(null);
    setNotice(message);
  };
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-6 border-t border-divider pt-8">
      <SectionHeading id={titleId} title="Conta e segurança">
        Só você vê esta parte.
      </SectionHeading>
      <p role="status" className="text-sm text-label empty:hidden">
        {notice}
      </p>
      <div className="flex flex-col">
        <EmailRow
          security={props.security}
          onChange={() => setDialog('email')}
          onNotice={setNotice}
        />
        <SecurityRow
          label="Senha"
          value={passwordLine(props.security.passwordChangedAt, props.now)}
        >
          <Button variant="outline" size="lg" onClick={() => setDialog('password')}>
            Trocar senha
          </Button>
        </SecurityRow>
        <TwoFactorRow twoFactor={props.security.twoFactor} onOpen={setDialog} />
      </div>
      <SessionsList sessions={props.sessions} now={props.now} onNotice={setNotice} />
      {dialog === 'password' && (
        <ChangePasswordDialog
          onClose={close}
          onChanged={done('Senha trocada. Os outros aparelhos saíram da conta.')}
        />
      )}
      {dialog === 'email' && (
        <ChangeEmailDialog
          onClose={close}
          onRequested={done('Enviamos o link para o novo e-mail. A troca vale depois do clique.')}
        />
      )}
      {dialog === 'two-factor-setup' && (
        <TwoFactorSetupDialog
          username={props.username}
          clipboard={props.clipboard}
          onClose={close}
          onEnabled={() => setNotice('2FA ligado.')}
        />
      )}
      {dialog === 'two-factor-disable' && (
        <TwoFactorDisableDialog onClose={close} onDisabled={done('2FA desligado.')} />
      )}
      {dialog === 'recovery-codes' && (
        <RecoveryCodesRegenerateDialog
          username={props.username}
          clipboard={props.clipboard}
          onClose={close}
        />
      )}
    </section>
  );
}

function passwordLine(changedAt: string | null, now: Date): string {
  if (changedAt === null) return 'Ainda é a senha da criação da conta.';
  return `Trocada ${sinceLabel(changedAt, now)}`;
}

type EmailRowProps = Readonly<{
  security: AccountSecurityDto;
  onChange: () => void;
  onNotice: (notice: string) => void;
}>;

function EmailRow({ security, onChange, onNotice }: EmailRowProps): React.JSX.Element {
  const cancel = useAccountFetcher();
  const failure = failureOf(cancel.settled);
  useOnSettled(cancel.settled, (result) => {
    if ('done' in result) onNotice('Troca de e-mail cancelada.');
  });
  const value = (
    <>
      <span className="break-all">{security.email}</span>
      {security.pendingEmail && (
        <span className="block text-[13px] text-muted-foreground">
          Aguardando confirmação em {security.pendingEmail}
        </span>
      )}
      {failure && (
        <Alert variant="destructive" className="mt-2 px-3.5 py-3 text-sm">
          {accountFailureMessage(failure)}
        </Alert>
      )}
    </>
  );
  return (
    <SecurityRow label="E-mail" value={value}>
      {security.pendingEmail && (
        <Button
          variant="ghost"
          size="lg"
          disabled={cancel.busy}
          onClick={() => cancel.send({ intent: 'email-cancel' })}
        >
          {cancel.busy ? 'Cancelando…' : 'Cancelar troca'}
        </Button>
      )}
      <Button variant="outline" size="lg" onClick={onChange}>
        Trocar e-mail
      </Button>
    </SecurityRow>
  );
}
