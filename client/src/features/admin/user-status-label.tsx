import type { DirectoryStatus } from '@/lib/user-directory';
import { cn } from '@/lib/utils';

const STATUS_TEXT: Readonly<Record<DirectoryStatus, string>> = {
  active: 'Ativo',
  invited: 'Convidado',
  'invite-expired': 'Convite vencido',
  suspended: 'Suspenso',
};

// The dot maps a defined state, always said in text too (design-system: status is text).
const DOT: Readonly<Record<DirectoryStatus, string>> = {
  active: 'bg-chart-2',
  invited: 'bg-primary',
  'invite-expired': 'bg-muted-foreground',
  suspended: 'bg-destructive',
};

/** The status of a row in spaced capitals, with its dot.
 *
 *  Example: `<UserStatusLabel status="suspended" /> // ● SUSPENSO` */
export function UserStatusLabel({
  status,
}: Readonly<{ status: DirectoryStatus }>): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] uppercase">
      <span aria-hidden="true" className={cn('size-1.5', DOT[status])} />
      {STATUS_TEXT[status]}
    </span>
  );
}
