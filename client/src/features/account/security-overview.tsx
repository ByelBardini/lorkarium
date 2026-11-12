import type { AccountSecurityDto } from '@lorkarium/contracts';
import {
  KeyRoundIcon,
  LaptopIcon,
  MailWarningIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  type LucideIcon,
} from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/utils';
import { devicesLine, passwordLine, protectionSummary } from './security-lines';

export type SecurityOverviewProps = Readonly<{
  security: AccountSecurityDto;
  devices: number;
  now: Date;
}>;

/** "Proteção da conta": the account at a glance beside the rows (2FA, the password's age, the
 *  devices, an e-mail change waiting), with what 2FA adds when it is off.
 *
 *  Example: `<SecurityOverview security={security} devices={sessions.length} now={now} />` */
export function SecurityOverview({
  security,
  devices,
  now,
}: SecurityOverviewProps): React.JSX.Element {
  const titleId = useId();
  const twoFactorOn = security.twoFactor.enabled;
  const summary = protectionSummary(twoFactorOn);
  const ShieldIcon = twoFactorOn ? ShieldCheckIcon : ShieldAlertIcon;
  return (
    <aside aria-labelledby={titleId} className="flex flex-col gap-5">
      <h3
        id={titleId}
        className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase"
      >
        Proteção da conta
      </h3>
      <div className="flex items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center bg-muted">
          <ShieldIcon
            aria-hidden="true"
            className={cn('size-7', twoFactorOn ? 'text-primary' : 'text-muted-foreground')}
          />
        </span>
        <p className="font-display text-2xl font-semibold">{summary.title}</p>
      </div>
      <p className="max-w-prose text-[15px]/relaxed text-muted-foreground">{summary.text}</p>
      <ul className="flex flex-col">
        <OverviewLine icon={ShieldIcon} good={twoFactorOn}>
          {twoFactorOn
            ? 'Verificação em duas etapas ligada'
            : 'Verificação em duas etapas desligada'}
        </OverviewLine>
        <OverviewLine icon={KeyRoundIcon}>
          {passwordLine(security.passwordChangedAt, now)}
        </OverviewLine>
        <OverviewLine icon={LaptopIcon}>{devicesLine(devices)}</OverviewLine>
        {security.pendingEmail && (
          <OverviewLine icon={MailWarningIcon}>Troca de e-mail esperando confirmação</OverviewLine>
        )}
      </ul>
    </aside>
  );
}

type OverviewLineProps = Readonly<{ icon: LucideIcon; good?: boolean; children: string }>;

function OverviewLine({
  icon: Icon,
  good = false,
  children,
}: OverviewLineProps): React.JSX.Element {
  return (
    <li className="flex items-center gap-3 border-t border-divider py-3 text-[15px] text-label">
      <Icon
        aria-hidden="true"
        className={cn('size-5 shrink-0', good ? 'text-primary' : 'text-muted-foreground')}
      />
      {children}
    </li>
  );
}
