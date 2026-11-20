import { ShieldAlertIcon } from 'lucide-react';

/** Why a billing action of the backoffice is disabled: it moves money of another account, so it
 *  asks the admin's own 2FA (the billing service refuses without it anyway).
 *
 *  Example: `<TwoFactorRequiredNote action="reembolsar" />` */
export function TwoFactorRequiredNote({ action }: Readonly<{ action: string }>): React.JSX.Element {
  return (
    <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <ShieldAlertIcon aria-hidden="true" className="size-4 shrink-0 text-chart-2" />
      Ative a verificação em duas etapas da sua conta para {action}.
    </p>
  );
}
