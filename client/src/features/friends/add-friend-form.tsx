import { friendsFailureText } from '@/lib/friends-failure-text';
import type { FriendsScreenDeps, ShowFriendsNotice } from './friends-screen';
import { UsernameForm } from './username-form';

/** "Adicionar pelo @usuário": sends a friend request to the exact @. When that person had
 *  already asked, the two become friends at once.
 *
 *  Example: `<AddFriendForm deps={deps} onNotice={show} />` */
export function AddFriendForm({
  deps,
  onNotice,
}: Readonly<{ deps: FriendsScreenDeps; onNotice: ShowFriendsNotice }>): React.JSX.Element {
  const send = async (username: string): Promise<string | null> => {
    const result = await deps.friends.getState().sendRequest(username);
    if (!result.ok) return friendsFailureText(result.failure, username);
    const text =
      result.value === 'accepted'
        ? `Você e @${username} agora são amigos.`
        : `Pedido enviado pra @${username}.`;
    onNotice({ text, error: false });
    return null;
  };
  return (
    <UsernameForm
      label="Adicionar pelo @usuário"
      submitLabel="Enviar"
      hint="A pessoa recebe um pedido e aparece aqui quando aceitar."
      onSubmit={send}
    />
  );
}
