import type { FriendDto } from '@lorkarium/contracts';
import { ArrowLeftIcon } from 'lucide-react';
import { Link } from 'react-router';
import { PRESENCE_LABELS } from '@/lib/friend-groups';
import type { FriendPresence } from '@/stores/friends-store';
import { FriendPerson } from './friend-person';
import { FRIENDS_PATH } from './friends-path';

/** The top of the conversation: "Voltar" below `md`, the friend with the status or "Na mesa X".
 *
 *  Example: `<ConversationHeader friend={bia} presence={presenceOf(state, bia.userId)} />` */
export function ConversationHeader({
  friend,
  presence,
}: Readonly<{ friend: FriendDto; presence: FriendPresence }>): React.JSX.Element {
  const table = presence.status === 'offline' ? null : presence.table;
  return (
    <header className="flex items-center gap-3 border-b border-border px-4 py-3">
      <Link
        to={FRIENDS_PATH}
        className="inline-flex items-center gap-1 text-sm text-label no-underline md:hidden"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        Voltar
      </Link>
      <h2 className="sr-only">{`Conversa com ${friend.name}`}</h2>
      <FriendPerson
        person={friend}
        status={presence.status}
        detail={
          table
            ? `Na mesa ${table.name}`
            : `@${friend.username} · ${PRESENCE_LABELS[presence.status]}`
        }
        detailClassName={table ? 'text-primary' : undefined}
      />
    </header>
  );
}
