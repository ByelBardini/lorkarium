import type {
  DirectMessageCommands,
  DirectMessageSendResult,
} from '@/services/direct-message-commands';

export const DM_MESSAGE_ID = '4e5f6071-8293-4aa4-8bb5-d6e7f8091a2b';

/** The direct messages the screen sent: `sent` keeps each `{ toUserId, text }` and every one
 *  answers `answer` (ok by default); `typings` keeps each "digitando" target. The message itself
 *  is played by the test as a `sent` event.
 *
 *  Example: `commands.answer = { ok: false, failure: { kind: 'recipient_offline' } }` */
export class DirectMessageCommandsFake implements DirectMessageCommands {
  readonly sent: Array<Readonly<{ toUserId: string; text: string }>> = [];
  readonly typings: string[] = [];
  answer: DirectMessageSendResult = { ok: true, messageId: DM_MESSAGE_ID };

  async send(toUserId: string, text: string): Promise<DirectMessageSendResult> {
    this.sent.push({ toUserId, text });
    return this.answer;
  }

  typing(toUserId: string): void {
    this.typings.push(toUserId);
  }
}
