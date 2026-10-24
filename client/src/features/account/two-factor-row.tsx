import type { AccountSecurityDto } from '@lorkarium/contracts';
import { Button } from '@/components/ui/button';
import { SecurityRow, type SecurityDialog } from './security-row';

export type TwoFactorRowProps = Readonly<{
  twoFactor: AccountSecurityDto['twoFactor'];
  onOpen: (dialog: SecurityDialog) => void;
}>;

/** "Verificação em duas etapas": off with "Ligar 2FA", or on with how many recovery codes are
 *  left, "Gerar novos códigos" and "Desligar".
 *
 *  Example: `<TwoFactorRow twoFactor={security.twoFactor} onOpen={setDialog} />` */
export function TwoFactorRow({ twoFactor, onOpen }: TwoFactorRowProps): React.JSX.Element {
  const left = twoFactor.recoveryCodesLeft;
  const value = twoFactor.enabled
    ? `Ligado · ${left} ${left === 1 ? 'código' : 'códigos'} de recuperação`
    : 'Desligado';
  return (
    <SecurityRow label="Verificação em duas etapas (2FA)" value={value}>
      {twoFactor.enabled ? (
        <>
          <Button variant="outline" size="lg" onClick={() => onOpen('recovery-codes')}>
            Gerar novos códigos
          </Button>
          <Button variant="ghost" size="lg" onClick={() => onOpen('two-factor-disable')}>
            Desligar
          </Button>
        </>
      ) : (
        <Button variant="outline" size="lg" onClick={() => onOpen('two-factor-setup')}>
          Ligar 2FA
        </Button>
      )}
    </SecurityRow>
  );
}
