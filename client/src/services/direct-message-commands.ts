import { DM_ERROR_CODES, DM_EVENTS, dmSendAckDto, type ApiErrorDto } from '@lorkarium/contracts';
import type { RealtimeTransport } from './realtime-transport';

/** `rate_limited` carries the seconds to wait; the others say why the message did not go. */
export type DirectMessageFailure =
  | Readonly<{ kind: 'rate_limited'; retryAfterSeconds: number }>
  | Readonly<{
      kind:
        | 'not_friends'
        | 'recipient_offline'
        | 'sender_invisible'
        | 'invalid'
        | 'unauthenticated'
        | 'offline'
        | 'unexpected';
    }>;

export type DirectMessageSendResult =
  | Readonly<{ ok: true; messageId: string }>
  | Readonly<{ ok: false; failure: DirectMessageFailure }>;

/** Direct messages over the account socket; `send` answers its ack and never throws. The message
 *  itself arrives to both accounts as `dm:sent`.
 *
 *  Example: `await dm.send(bia.userId, 'oi')` */
export interface DirectMessageCommands {
  send(toUserId: string, text: string): Promise<DirectMessageSendResult>;
  /** "Digitando…": no ack; the server drops it silently over its bucket. */
  typing(toUserId: string): void;
}

// Same patience as every realtime command.
const SEND_ACK_TIMEOUT_MS = 5000;

// The bucket refills within a second: one second is always enough for the next message.
const DEFAULT_RETRY_AFTER_SECONDS = 1;

const FAILURE_BY_CODE: Readonly<Record<string, DirectMessageFailure>> = {
  [DM_ERROR_CODES.notFriends]: { kind: 'not_friends' },
  [DM_ERROR_CODES.recipientOffline]: { kind: 'recipient_offline' },
  [DM_ERROR_CODES.senderInvisible]: { kind: 'sender_invisible' },
  INVALID_BODY: { kind: 'invalid' },
  UNAUTHENTICATED: { kind: 'unauthenticated' },
};

/** `DirectMessageCommands` over the realtime transport: a new action id per message, an ack
 *  outside the DTO is `unexpected`, no ack in 5 s is `offline`.
 *
 *  Example: `new RealtimeDirectMessageCommands(transport, () => crypto.randomUUID())` */
export class RealtimeDirectMessageCommands implements DirectMessageCommands {
  constructor(
    private readonly transport: RealtimeTransport,
    private readonly newActionId: () => string,
  ) {}

  async send(toUserId: string, text: string): Promise<DirectMessageSendResult> {
    const payload = { actionId: this.newActionId(), toUserId, text };
    try {
      const answer = await this.transport.emitWithAck(DM_EVENTS.send, payload, SEND_ACK_TIMEOUT_MS);
      return sendResultOf(answer);
    } catch {
      return { ok: false, failure: { kind: 'offline' } };
    }
  }

  typing(toUserId: string): void {
    if (this.transport.isConnected()) this.transport.emit(DM_EVENTS.typing, { toUserId });
  }
}

function sendResultOf(answer: unknown): DirectMessageSendResult {
  const parsed = dmSendAckDto.safeParse(answer);
  if (!parsed.success) return { ok: false, failure: { kind: 'unexpected' } };
  if (parsed.data.ok) return { ok: true, messageId: parsed.data.messageId };
  return { ok: false, failure: failureOf(parsed.data.error) };
}

function failureOf(error: ApiErrorDto): DirectMessageFailure {
  if (error.code === DM_ERROR_CODES.rateLimited) {
    const retryAfterSeconds = error.retryAfterSeconds || DEFAULT_RETRY_AFTER_SECONDS;
    return { kind: 'rate_limited', retryAfterSeconds };
  }
  return FAILURE_BY_CODE[error.code] ?? { kind: 'unexpected' };
}
