import {
  CHAT_EVENTS,
  chatSendAckDto,
  type ApiErrorDto,
  type ChatSendCommandInput,
} from '@lorkarium/contracts';
import type { RealtimeTransport } from './realtime-transport';

/** What the composer asks for: the command without the action id and the table. */
export type ChatSendRequest = Omit<ChatSendCommandInput, 'actionId' | 'campaignId'>;

/** `rate_limited` carries the seconds to wait; `speaker_not_found` is the token (or its grid,
 *  which must be open on this connection) the person spoke as, gone meanwhile;
 *  `speaker_not_allowed` a token speaking anywhere but the Table without a whisper;
 *  `recipient_is_sender` a whisper or direct to oneself; `sender_not_in_group` a group without
 *  the sender. */
export type ChatSendFailure =
  | Readonly<{ kind: 'rate_limited'; retryAfterSeconds: number }>
  | Readonly<{
      kind:
        | 'not_found'
        | 'forbidden'
        | 'recipient_not_member'
        | 'recipient_is_sender'
        | 'sender_not_in_group'
        | 'speaker_not_allowed'
        | 'speaker_not_found'
        | 'invalid'
        | 'unauthenticated'
        | 'offline'
        | 'unexpected';
    }>;

export type ChatSendResult =
  Readonly<{ ok: true; messageId: string }> | Readonly<{ ok: false; failure: ChatSendFailure }>;

/** The chat of an open table; answers with its ack, never throws. The message itself arrives to
 *  everyone it is for, the sender included, as `chat:sent`.
 *
 *  Example: `await chat.send(campaignId, { channel: { kind: 'table', whisperTo: null }, speaker: { kind: 'self' }, text: 'oi' })` */
export interface ChatCommands {
  send(campaignId: string, request: ChatSendRequest): Promise<ChatSendResult>;
}

// Same patience as every board command.
const SEND_ACK_TIMEOUT_MS = 5000;

// The bucket refills 2 per second: one second is always enough for the next message.
const DEFAULT_RETRY_AFTER_SECONDS = 1;

const FAILURE_BY_CODE: Readonly<Record<string, ChatSendFailure>> = {
  CAMPAIGN_NOT_FOUND: { kind: 'not_found' },
  FORBIDDEN: { kind: 'forbidden' },
  CHAT_RECIPIENT_NOT_MEMBER: { kind: 'recipient_not_member' },
  CHAT_RECIPIENT_IS_SENDER: { kind: 'recipient_is_sender' },
  CHAT_SENDER_NOT_IN_GROUP: { kind: 'sender_not_in_group' },
  CHAT_SPEAKER_NOT_ALLOWED: { kind: 'speaker_not_allowed' },
  SCENE_NOT_FOUND: { kind: 'speaker_not_found' },
  TOKEN_NOT_FOUND: { kind: 'speaker_not_found' },
  INVALID_BODY: { kind: 'invalid' },
  UNAUTHENTICATED: { kind: 'unauthenticated' },
};

/** `ChatCommands` over the realtime transport: a new action id per message, an ack outside the
 *  DTO is `unexpected`, no ack in 5 s is `offline`.
 *
 *  Example: `new RealtimeChatCommands(transport, () => crypto.randomUUID())` */
export class RealtimeChatCommands implements ChatCommands {
  constructor(
    private readonly transport: RealtimeTransport,
    private readonly newActionId: () => string,
  ) {}

  async send(campaignId: string, request: ChatSendRequest): Promise<ChatSendResult> {
    const payload = { actionId: this.newActionId(), campaignId, ...request };
    try {
      const answer = await this.transport.emitWithAck(
        CHAT_EVENTS.send,
        payload,
        SEND_ACK_TIMEOUT_MS,
      );
      return sendResultOf(answer);
    } catch {
      return { ok: false, failure: { kind: 'offline' } };
    }
  }
}

function sendResultOf(answer: unknown): ChatSendResult {
  const parsed = chatSendAckDto.safeParse(answer);
  if (!parsed.success) return { ok: false, failure: { kind: 'unexpected' } };
  if (parsed.data.ok) return { ok: true, messageId: parsed.data.messageId };
  return { ok: false, failure: sendFailureOf(parsed.data.error) };
}

function sendFailureOf(error: ApiErrorDto): ChatSendFailure {
  if (error.code === 'RATE_LIMITED') {
    const retryAfterSeconds = error.retryAfterSeconds || DEFAULT_RETRY_AFTER_SECONDS;
    return { kind: 'rate_limited', retryAfterSeconds };
  }
  return FAILURE_BY_CODE[error.code] ?? { kind: 'unexpected' };
}
