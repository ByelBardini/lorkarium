import {
  DICE_EVENTS,
  diceRollAckDto,
  type ApiErrorDto,
  type DiceRollCommandInput,
} from '@lorkarium/contracts';
import type { RealtimeTransport } from './realtime-transport';

/** What the tray asks for: the command without the action id and the table. */
export type DiceRollRequest = Omit<DiceRollCommandInput, 'actionId' | 'campaignId'>;

/** `invalid_expression` carries the server's message (the notation error, in English, citing
 *  the part and the position); `rate_limited` the seconds to wait. */
export type DiceRollFailure =
  | Readonly<{ kind: 'invalid_expression'; message: string }>
  | Readonly<{ kind: 'rate_limited'; retryAfterSeconds: number }>
  | Readonly<{
      kind: 'forbidden' | 'not_found' | 'invalid' | 'unauthenticated' | 'offline' | 'unexpected';
    }>;

export type DiceRollResult =
  Readonly<{ ok: true; rollId: string }> | Readonly<{ ok: false; failure: DiceRollFailure }>;

/** The dice of an open table; answers with its ack, never throws. The roll itself (the result,
 *  the throw) arrives to everyone, the roller included, as `dice:rolled`.
 *
 *  Example: `await dice.roll(campaignId, { label: null, parts, visibility: 'public', aspect: 1.78 })` */
export interface DiceCommands {
  roll(campaignId: string, request: DiceRollRequest): Promise<DiceRollResult>;
}

// Same patience as every board command.
const ROLL_ACK_TIMEOUT_MS = 5000;

// The bucket refills 2 per second: one second is always enough for the next roll.
const DEFAULT_RETRY_AFTER_SECONDS = 1;

const FAILURE_BY_CODE: Readonly<Record<string, DiceRollFailure>> = {
  FORBIDDEN: { kind: 'forbidden' },
  CAMPAIGN_NOT_FOUND: { kind: 'not_found' },
  INVALID_BODY: { kind: 'invalid' },
  UNAUTHENTICATED: { kind: 'unauthenticated' },
};

/** `DiceCommands` over the realtime transport: a new action id per roll, an ack outside the
 *  DTO is `unexpected`, no ack in 5 s is `offline`.
 *
 *  Example: `new RealtimeDiceCommands(transport, () => crypto.randomUUID())` */
export class RealtimeDiceCommands implements DiceCommands {
  constructor(
    private readonly transport: RealtimeTransport,
    private readonly newActionId: () => string,
  ) {}

  async roll(campaignId: string, request: DiceRollRequest): Promise<DiceRollResult> {
    const payload = { actionId: this.newActionId(), campaignId, ...request };
    try {
      const answer = await this.transport.emitWithAck(
        DICE_EVENTS.roll,
        payload,
        ROLL_ACK_TIMEOUT_MS,
      );
      return rollResultOf(answer);
    } catch {
      return { ok: false, failure: { kind: 'offline' } };
    }
  }
}

function rollResultOf(answer: unknown): DiceRollResult {
  const parsed = diceRollAckDto.safeParse(answer);
  if (!parsed.success) return { ok: false, failure: { kind: 'unexpected' } };
  if (parsed.data.ok) return { ok: true, rollId: parsed.data.rollId };
  return { ok: false, failure: rollFailureOf(parsed.data.error) };
}

function rollFailureOf(error: ApiErrorDto): DiceRollFailure {
  if (error.code === 'INVALID_DICE_EXPRESSION') {
    return { kind: 'invalid_expression', message: error.message };
  }
  if (error.code === 'RATE_LIMITED') {
    const retryAfterSeconds = error.retryAfterSeconds || DEFAULT_RETRY_AFTER_SECONDS;
    return { kind: 'rate_limited', retryAfterSeconds };
  }
  return FAILURE_BY_CODE[error.code] ?? { kind: 'unexpected' };
}
