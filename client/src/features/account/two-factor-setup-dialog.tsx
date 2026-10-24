import type { TwoFactorSetupResponseDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { CopyCodeButton } from '@/components/copy-code-button';
import { groupedSecret } from '@/lib/two-factor-text';
import type { Clipboard } from '@/services/clipboard';
import { AccountDialog } from './account-dialog';
import { RecoveryCodesView } from './recovery-codes-view';
import { TwoFactorForm } from './two-factor-form';
import { failureOf, useAccountFetcher, useOnSettled } from './use-account-fetcher';

type SetupStep =
  | Readonly<{ kind: 'password' }>
  | Readonly<{ kind: 'scan'; setup: TwoFactorSetupResponseDto }>
  | Readonly<{ kind: 'codes'; codes: string[] }>;

const DESCRIPTION: Readonly<Record<SetupStep['kind'], string>> = {
  password: 'Confirme sua senha para começar.',
  scan: 'Leia o QR code no app autenticador (ou digite a chave) e confirme com o código que ele mostra.',
  codes: 'O 2FA está ligado. Estes códigos só aparecem agora.',
};

export type TwoFactorSetupDialogProps = Readonly<{
  username: string;
  clipboard: Clipboard;
  onClose: () => void;
  /** The app code was accepted: 2FA is on (the codes are still on screen). */
  onEnabled: () => void;
}>;

/** "Ligar 2FA" in three steps: the password, the QR + key + first code, and the 10 recovery codes.
 *  Closing before the code leaves 2FA off (the server keeps only a pending secret).
 *
 *  Example: `{dialog === 'two-factor-setup' && <TwoFactorSetupDialog username="ana" clipboard={clipboard} onClose={close} onEnabled={announce} />}` */
export function TwoFactorSetupDialog(props: TwoFactorSetupDialogProps): React.JSX.Element {
  const [step, setStep] = useState<SetupStep>({ kind: 'password' });
  const enabled = (codes: string[]): void => {
    setStep({ kind: 'codes', codes });
    props.onEnabled();
  };
  return (
    <AccountDialog title="Ligar 2FA" description={DESCRIPTION[step.kind]} onClose={props.onClose}>
      {step.kind === 'password' && (
        <PasswordStep
          onCancel={props.onClose}
          onReady={(setup) => setStep({ kind: 'scan', setup })}
        />
      )}
      {step.kind === 'scan' && (
        <ScanStep
          setup={step.setup}
          clipboard={props.clipboard}
          onCancel={props.onClose}
          onEnabled={enabled}
        />
      )}
      {step.kind === 'codes' && (
        <RecoveryCodesView
          codes={step.codes}
          username={props.username}
          clipboard={props.clipboard}
          onDone={props.onClose}
        />
      )}
    </AccountDialog>
  );
}

type PasswordStepProps = Readonly<{
  onCancel: () => void;
  onReady: (setup: TwoFactorSetupResponseDto) => void;
}>;

function PasswordStep({ onCancel, onReady }: PasswordStepProps): React.JSX.Element {
  const fetcher = useAccountFetcher();
  useOnSettled(fetcher.settled, (result) => {
    if ('setup' in result) onReady(result.setup);
  });
  return (
    <TwoFactorForm
      label="Confirmar senha"
      askPassword
      code={null}
      submitLabel="Continuar"
      busyLabel="Conferindo…"
      busy={fetcher.busy}
      failure={failureOf(fetcher.settled)}
      onSubmit={({ currentPassword }) =>
        fetcher.send({ intent: 'two-factor-setup', input: { currentPassword } })
      }
      onCancel={onCancel}
    />
  );
}

type ScanStepProps = Readonly<{
  setup: TwoFactorSetupResponseDto;
  clipboard: Clipboard;
  onCancel: () => void;
  onEnabled: (codes: string[]) => void;
}>;

function ScanStep({ setup, clipboard, onCancel, onEnabled }: ScanStepProps): React.JSX.Element {
  const fetcher = useAccountFetcher();
  useOnSettled(fetcher.settled, (result) => {
    if ('recoveryCodes' in result) onEnabled(result.recoveryCodes);
  });
  return (
    <div className="flex flex-col gap-4">
      <img
        src={setup.qrImage}
        alt="QR code para o app autenticador"
        className="size-44 self-center bg-white p-2"
      />
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-label">Chave para digitar no app</span>
        <code className="font-mono text-[15px] tracking-[0.08em] text-foreground">
          {groupedSecret(setup.secret)}
        </code>
        <CopyCodeButton code={setup.secret} clipboard={clipboard} label="Copiar chave" />
      </div>
      <TwoFactorForm
        label="Confirmar código"
        askPassword={false}
        code="totp"
        submitLabel="Ligar 2FA"
        busyLabel="Ligando…"
        busy={fetcher.busy}
        failure={failureOf(fetcher.settled)}
        onSubmit={({ code }) => fetcher.send({ intent: 'two-factor-enable', input: { code } })}
        onCancel={onCancel}
      />
    </div>
  );
}
