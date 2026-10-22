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
  away: 'border border-primary',
  offline: 'bg-divider',
};

/** The presence symbol of a member: a gold square, a hollow one when away, a dim one offline,
 *  named for the screen reader.
 *
 *  Example: `<PresenceMark presence="online" />` */
export function PresenceMark({ presence }: Readonly<{ presence: MemberPresence }>) {
  return (
    <span
      role="img"
      aria-label={PRESENCE_LABEL[presence]}
      className={cn('inline-block size-2 shrink-0', PRESENCE_LOOK[presence])}
    />
  );
}
