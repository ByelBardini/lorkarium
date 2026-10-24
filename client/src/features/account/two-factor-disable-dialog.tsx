import { useState } from 'react';
import type { Clipboard } from '@/services/clipboard';
import { AccountDialog } from './account-dialog';
import { RecoveryCodesView } from './recovery-codes-view';
import { TwoFactorForm } from './two-factor-form';
import { failureOf, useAccountFetcher, useOnSettled } from './use-account-fetcher';

export type TwoFactorDisableDialogProps = Readonly<{
  onClose: () => void;
  onDisabled: () => void;
}>;

/** "Desligar 2FA": the password and a code (from the app or a recovery one).
 *
 *  Example: `{dialog === 'two-factor-disable' && <TwoFactorDisableDialog onClose={close} onDisabled={announce} />}` */
export function TwoFactorDisableDialog({
  onClose,
  onDisabled,
}: TwoFactorDisableDialogProps): React.JSX.Element {
  const fetcher = useAccountFetcher();
  useOnSettled(fetcher.settled, (result) => {
    if (result.intent === 'two-factor-disable' && 'done' in result) onDisabled();
  });
  return (
    <AccountDialog
      title="Desligar 2FA"
      description="Sem o 2FA, a senha volta a ser a única chave da conta."
      onClose={onClose}
    >
      <TwoFactorForm
        label="Desligar 2FA"
        askPassword
        code="any"
        submitLabel="Desligar"
        busyLabel="Desligando…"
        busy={fetcher.busy}
        failure={failureOf(fetcher.settled)}
        onSubmit={(input) => fetcher.send({ intent: 'two-factor-disable', input })}
        onCancel={onClose}
      />
    </AccountDialog>
  );
}

export type RecoveryCodesRegenerateDialogProps = Readonly<{
  username: string;
  clipboard: Clipboard;
  onClose: () => void;
}>;

/** "Gerar novos códigos": the password and a code, then the 10 new codes; the old ones die.
 *
 *  Example: `{dialog === 'recovery-codes' && <RecoveryCodesRegenerateDialog username="ana" clipboard={clipboard} onClose={close} />}` */
export function RecoveryCodesRegenerateDialog(
  props: RecoveryCodesRegenerateDialogProps,
): React.JSX.Element {
  const fetcher = useAccountFetcher();
  const [codes, setCodes] = useState<string[] | null>(null);
  useOnSettled(fetcher.settled, (result) => {
    if ('recoveryCodes' in result) setCodes(result.recoveryCodes);
  });
  return (
    <AccountDialog
      title="Gerar novos códigos"
      description="Confirme com a senha e um código do app."
      onClose={props.onClose}
    >
      {codes ? (
        <RecoveryCodesView
          codes={codes}
          username={props.username}
          clipboard={props.clipboard}
          warning="Os códigos antigos não valem mais."
          onDone={props.onClose}
        />
      ) : (
        <TwoFactorForm
          label="Gerar novos códigos"
          askPassword
          code="any"
          submitLabel="Gerar códigos"
          busyLabel="Gerando…"
          busy={fetcher.busy}
          failure={failureOf(fetcher.settled)}
          onSubmit={(input) => fetcher.send({ intent: 'recovery-codes-regenerate', input })}
          onCancel={props.onClose}
        />
      )}
    </AccountDialog>
  );
}
