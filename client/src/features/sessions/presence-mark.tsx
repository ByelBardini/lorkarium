import type { MemberPresence } from '@/lib/member-presence';
import { cn } from '@/lib/utils';

const PRESENCE_LABEL: Readonly<Record<MemberPresence, string>> = {
  online: 'online',
  away: 'ausente',
  offline: 'offline',
};

// The shape changes with the color: filled, hollow, dim — never color alone.
const PRESENCE_LOOK: Readonly<Record<MemberPresence, string>> = {
  online: 'bg-primary',
  away: 'border-2 border-primary bg-panel',
  offline: 'bg-divider',
};

// The badge cuts itself out of the picture with a ring in the panel's color.
const PLACEMENT_LOOK: Readonly<Record<PresenceMarkPlacement, string>> = {
  inline: 'inline-block size-2',
  badge: 'absolute size-3 ring-2 ring-panel',
};

export type PresenceMarkPlacement = 'inline' | 'badge';

/** The presence symbol of a member: a gold dot, a hollow one when away, a dim one offline, named
 *  for the screen reader. `badge` sits on the corner of a `relative` portrait or avatar; `inline`
 *  goes before the name when there is no picture; `className` places the badge on that corner.
 *
 *  Example: `<PresenceMark presence="online" placement="badge" className="right-1 bottom-1" />` */
export function PresenceMark({
  presence,
  placement = 'inline',
  className,
}: Readonly<{
  presence: MemberPresence;
  placement?: PresenceMarkPlacement;
  className?: string;
}>) {
  return (
    <span
      role="img"
      aria-label={PRESENCE_LABEL[presence]}
      className={cn(
        'shrink-0 rounded-full',
        PLACEMENT_LOOK[placement],
        PRESENCE_LOOK[presence],
        className,
      )}
    />
  );
}
