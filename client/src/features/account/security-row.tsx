import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SettingsRow } from './settings-row';

/** The dialog of the section that is open, if any (only one at a time, mounted only while open). */
export type SecurityDialog =
  'password' | 'email' | 'two-factor-setup' | 'two-factor-disable' | 'recovery-codes';

type SecurityRowProps = Readonly<{
  label: string;
  /** Why the setting matters, under the title. */
  description: string;
  icon: LucideIcon;
  /** Gold for a setting that protects the account (2FA on); muted otherwise. */
  tone?: 'good' | 'plain';
  value: React.ReactNode;
  children: React.ReactNode;
}>;

/** One setting of "Conta e segurança": what it is and why, how it stands, and its buttons.
 *
 *  Example: `<SecurityRow label="Senha" description="…" icon={KeyRoundIcon} value="Trocada há 3 meses"><Button>Trocar senha</Button></SecurityRow>` */
export function SecurityRow(props: SecurityRowProps): React.JSX.Element {
  const Icon = props.icon;
  return (
    <SettingsRow title={props.label} description={props.description} group>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="mr-auto flex min-w-0 items-start gap-3">
          <Icon
            aria-hidden="true"
            className={cn(
              'mt-0.5 size-5 shrink-0',
              props.tone === 'good' ? 'text-primary' : 'text-muted-foreground',
            )}
          />
          <div className="min-w-0 text-base text-foreground">{props.value}</div>
        </div>
        <div className="flex flex-wrap gap-2">{props.children}</div>
      </div>
    </SettingsRow>
  );
}
