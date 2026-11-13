/** What a destructive friends action asks before it runs. */
export type FriendConfirmation = Readonly<{
  title: string;
  description: string;
  action: string;
  run: () => void;
}>;

/** The confirmation of removing a friend (the conversation stays on this device).
 *
 *  Example: `setConfirmation(removeConfirmation('Bia', () => void remove()))` */
export function removeConfirmation(name: string, run: () => void): FriendConfirmation {
  return {
    title: `Remover ${name} dos amigos?`,
    description: 'A conversa fica guardada neste aparelho.',
    action: 'Remover',
    run,
  };
}

/** The confirmation of blocking someone (a friend or who sent a request).
 *
 *  Example: `setConfirmation(blockConfirmation('Bia', () => void block()))` */
export function blockConfirmation(name: string, run: () => void): FriendConfirmation {
  return {
    title: `Bloquear ${name}?`,
    description:
      'Sai dos amigos, não consegue mais te mandar pedido nem mensagem e não entra nas suas mesas. A conversa some deste aparelho.',
    action: 'Bloquear',
    run,
  };
}
