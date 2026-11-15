import type { ProfileCardDto } from '@lorkarium/contracts';
import { friendsFailureText } from '@/lib/friends-failure-text';
import type { FriendsResult } from '@/services/friends-api';
import type { ProfileCardDeps } from './profile-card-deps';
import type { ProfileCardMenuChoice } from './profile-card-menu';

/** A sentence the actions bar shows; `error` goes out as `role="alert"`. */
export type ProfileCardNotice = Readonly<{ text: string; error: boolean }>;

type FriendshipChoice = Exclude<ProfileCardMenuChoice, 'report'>;

type FriendshipCommand = Readonly<{
  run: () => Promise<FriendsResult<unknown>>;
  done: string;
}>;

function commandOf(
  choice: FriendshipChoice,
  card: ProfileCardDto,
  deps: ProfileCardDeps,
): FriendshipCommand {
  const friends = deps.friends.getState();
  const { id, name } = card;
  switch (choice) {
    case 'remove':
      return { run: () => friends.removeFriend(id), done: `${name} saiu dos seus amigos.` };
    case 'add':
      return {
        run: () => friends.sendRequest(card.username),
        done: `Pedido enviado para ${name}.`,
      };
    case 'accept':
      return { run: () => friends.acceptRequest(id), done: `Você e ${name} agora são amigos.` };
    case 'unblock':
      return { run: () => friends.unblock(id), done: `${name} foi desbloqueado.` };
    case 'block':
      return { run: () => friends.block({ userId: id }), done: `${name} foi bloqueado.` };
  }
}

/** Runs a friendship step of the ⋯ menu through the friends store, then reads the card again;
 *  answers the sentence to show. A block also forgets the conversation on this device.
 *
 *  Example: `setNotice(await runFriendship('block', card, deps, reload))` */
export async function runFriendship(
  choice: FriendshipChoice,
  card: ProfileCardDto,
  deps: ProfileCardDeps,
  reload: () => Promise<void>,
): Promise<ProfileCardNotice> {
  const command = commandOf(choice, card, deps);
  const result = await command.run();
  if (!result.ok) return { text: friendsFailureText(result.failure, card.username), error: true };
  if (choice === 'block') deps.directMessages.getState().forget(card.id);
  await reload();
  return { text: command.done, error: false };
}
