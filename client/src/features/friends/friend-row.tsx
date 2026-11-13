import type { FriendDto } from '@lorkarium/contracts';
import { Link } from 'react-router';
import { PRESENCE_LABELS } from '@/lib/friend-groups';
import { cn } from '@/lib/utils';
import type { FriendPresence } from '@/stores/friends-store';
import { FriendPerson } from './friend-person';
import { FriendRowMenu } from './friend-row-menu';
import { friendPath } from './friends-path';
import type { FriendsScreenDeps, ShowFriendsNotice } from './friends-screen';

export type FriendRowProps = Readonly<{
  friend: FriendDto;
  presence: FriendPresence;
  unread: number;
  selected: boolean;
  deps: FriendsScreenDeps;
  onNotice: ShowFriendsNotice;
}>;

/** One friend of the list: the whole row opens the conversation; the menu beside it removes or
 *  blocks. With a public table open, "Na mesa X" in gold instead of the status.
 *
 *  Example: `<FriendRow friend={bia} presence={presenceOf(state, bia.userId)} unread={2} selected={false} deps={deps} onNotice={show} />` */
export function FriendRow(props: FriendRowProps): React.JSX.Element {
  const { friend, presence, unread, selected } = props;
  const label = PRESENCE_LABELS[presence.status];
  const atTable = presence.table !== null && presence.status !== 'offline';
  return (
    <li className={cn('group flex items-center gap-1 pr-2', selected && 'bg-muted')}>
      <Link
        to={friendPath(friend.userId)}
        aria-label={`Conversar com ${friend.name}, ${label.toLowerCase()}`}
        aria-current={selected ? 'page' : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 px-4 py-2 text-foreground no-underline hover:no-underline"
      >
        <FriendPerson
          person={friend}
          status={presence.status}
          detail={atTable ? `Na mesa ${presence.table?.name ?? ''}` : label}
          detailClassName={atTable ? 'text-primary' : undefined}
        />
        {unread > 0 && <UnreadCount count={unread} />}
      </Link>
      <FriendRowMenu friend={friend} deps={props.deps} onNotice={props.onNotice} />
    </li>
  );
}

function UnreadCount({ count }: Readonly<{ count: number }>): React.JSX.Element {
  return (
    <span className="ml-auto rounded-sm bg-primary px-1.5 text-[11px] leading-5 font-semibold text-primary-foreground tabular-nums">
      {count}
      <span className="sr-only">{count === 1 ? ' mensagem nova' : ' mensagens novas'}</span>
    </span>
  );
}
