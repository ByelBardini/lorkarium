import type { FriendDto } from '@lorkarium/contracts';
import { BanIcon, EllipsisIcon, MessageCircleIcon, UserMinusIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { friendsFailureText } from '@/lib/friends-failure-text';
import { FriendConfirmDialog } from './friend-confirm-dialog';
import {
  blockConfirmation,
  removeConfirmation,
  type FriendConfirmation,
} from './friend-confirmations';
import { friendPath } from './friends-path';
import type { FriendsScreenDeps, ShowFriendsNotice } from './friends-screen';

export type FriendRowMenuProps = Readonly<{
  friend: FriendDto;
  deps: FriendsScreenDeps;
  onNotice: ShowFriendsNotice;
}>;

/** "Opções de Bia": message, remove and block, the last two behind the confirmation.
 *
 *  Example: `<FriendRowMenu friend={bia} deps={deps} onNotice={show} />` */
export function FriendRowMenu({ friend, deps, onNotice }: FriendRowMenuProps): React.JSX.Element {
  const navigate = useNavigate();
  const [confirmation, setConfirmation] = useState<FriendConfirmation | null>(null);
  const remove = async (): Promise<void> => {
    const result = await deps.friends.getState().removeFriend(friend.userId);
    if (!result.ok) return onNotice({ text: friendsFailureText(result.failure), error: true });
    onNotice({ text: `${friend.name} saiu dos seus amigos.`, error: false });
  };
  const block = async (): Promise<void> => {
    const result = await deps.friends.getState().block({ userId: friend.userId });
    if (!result.ok) return onNotice({ text: friendsFailureText(result.failure), error: true });
    deps.directMessages.getState().forget(friend.userId);
    onNotice({ text: `${friend.name} foi bloqueado.`, error: false });
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Opções de ${friend.name}`}>
            <EllipsisIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void navigate(friendPath(friend.userId))}>
            <MessageCircleIcon aria-hidden="true" />
            Mandar mensagem
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setConfirmation(removeConfirmation(friend.name, () => void remove()))}
          >
            <UserMinusIcon aria-hidden="true" />
            Remover amigo
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setConfirmation(blockConfirmation(friend.name, () => void block()))}
          >
            <BanIcon aria-hidden="true" />
            Bloquear
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FriendConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(null)} />
    </>
  );
}
