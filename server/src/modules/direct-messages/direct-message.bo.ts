import {
  DirectMessageNotFriendsError,
  DirectMessageRecipientOfflineError,
  DirectMessageSenderInvisibleError,
  type DirectMessageError,
} from './direct-messages.error';

/** What decides a direct message, read by the service: whether the two are friends and whether
 *  each is visibly online (online or away; invisible counts as offline). */
export type DirectMessageContext = Readonly<{
  senderId: string;
  recipientId: string;
  friends: boolean;
  senderVisible: boolean;
  recipientVisible: boolean;
}>;

/** Whether a direct message (or "digitando…") may go from the sender to the recipient: only
 *  between friends, never from an invisible sender, never to someone not visibly online. Checked
 *  in that order, so a stranger never learns whether the recipient is online.
 *
 *  Example: `new DirectMessageBo(context).requireDeliverable() // throws DM_NOT_FRIENDS` */
export class DirectMessageBo {
  constructor(private readonly context: DirectMessageContext) {}

  requireDeliverable(): void {
    const refusal = this.refusal();
    if (refusal) throw refusal;
  }

  /** "Digitando…" has no ack: it goes or it drops, silently. */
  isDeliverable(): boolean {
    return this.refusal() === null;
  }

  private refusal(): DirectMessageError | null {
    const { senderId, recipientId, friends, senderVisible, recipientVisible } = this.context;
    if (!friends || senderId === recipientId) {
      return new DirectMessageNotFriendsError(senderId, recipientId);
    }
    if (!senderVisible) return new DirectMessageSenderInvisibleError(senderId);
    if (!recipientVisible) return new DirectMessageRecipientOfflineError(recipientId);
    return null;
  }
}
