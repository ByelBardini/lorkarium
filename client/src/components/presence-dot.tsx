import type { PresenceStatusDto } from '@lorkarium/contracts';
import { cn } from '@/lib/utils';

/** What a dot can say: a friend's status, or the account itself being invisible. */
export type PresenceDotStatus = PresenceStatusDto | 'invisible';

const DOT_CLASS: Readonly<Record<PresenceDotStatus, string>> = {
  online: 'bg-chart-4',
  away: 'bg-primary',
  offline: 'border-2 border-muted-foreground bg-panel',
  invisible: 'border-2 border-muted-foreground bg-panel',
};

/** The status dot over the corner of an avatar (a circle, as the avatar it sits on). Decorative:
 *  the status is always said in text next to it.
 *
 *  Example: `<span className="relative"><UserAvatar … /><PresenceDot status="online" /></span>` */
export function PresenceDot({
  status,
  className,
}: Readonly<{ status: PresenceDotStatus; className?: string }>): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      data-status={status}
      className={cn(
        'absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-panel',
        DOT_CLASS[status],
        className,
      )}
    />
  );
}
