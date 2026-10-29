import type { ChatCommands, ChatSendRequest, ChatSendResult } from '@/services/chat-commands';
import { CHAT_MESSAGE_ID } from './chat-fixtures';

/** The messages the room sent: `sent` keeps each `{ campaignId, request }`; every one answers
 *  `answer` (ok with `CHAT_MESSAGE_ID` by default). The message itself is played by the test as
 *  a `chatSent` update of the table session fake.
 *
 *  Example: `deps.chat.answer = { ok: false, failure: { kind: 'rate_limited', retryAfterSeconds: 1 } }` */
export class ChatCommandsFake implements ChatCommands {
  readonly sent: Array<Readonly<{ campaignId: string; request: ChatSendRequest }>> = [];
  answer: ChatSendResult = { ok: true, messageId: CHAT_MESSAGE_ID };

  async send(campaignId: string, request: ChatSendRequest): Promise<ChatSendResult> {
    this.sent.push({ campaignId, request });
    return this.answer;
  }
}
