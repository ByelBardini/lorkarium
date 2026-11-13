import type { FriendProfileDto } from '@lorkarium/contracts';
import { PresenceDot, type PresenceDotStatus } from '@/components/presence-dot';
import { UserAvatar } from '@/components/user-avatar';
import { cn } from '@/lib/utils';

export type FriendPersonProps = Readonly<{
  person: FriendProfileDto;
  /** The line under the name: the status, "Na mesa X", "há 2 h" or the @. */
  detail: string;
  /** Left out, the avatar has no dot (requests and blocked people show no status). */
  status?: PresenceDotStatus;
  detailClassName?: string;
}>;

/** Avatar, nickname and one line under it: the person of every row on the friends screen.
 *
 *  Example: `<FriendPerson person={bia} detail="Online" status="online" />` */
export function FriendPerson({
  person,
  detail,
  status,
  detailClassName,
}: FriendPersonProps): React.JSX.Element {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className={cn('relative shrink-0', status === 'offline' && 'opacity-60')}>
        <UserAvatar name={person.name} color={person.color} avatarId={person.avatarId} />
        {status && <PresenceDot status={status} />}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{person.name}</span>
        <span className={cn('truncate text-xs text-muted-foreground', detailClassName)}>
          {detail}
        </span>
      </span>
    </span>
  );
}
