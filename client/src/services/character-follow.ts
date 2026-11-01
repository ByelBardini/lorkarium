import {
  BOARD_EVENTS,
  characterChangedEventDto,
  characterRemovedEventDto,
  characterSyncAckDto,
} from '@lorkarium/contracts';
import type { z } from 'zod';
import type { RealtimeTransport, Unsubscribe } from './realtime-transport';
import { syncFailureOf } from './sync-failure';
import type { CharacterListener, CharacterUpdate, CharactersHandle } from './table-session-api';

/** The characters of one table visit: `character:sync` after each join (and on `resync`), and the
 *  validated `character:*` events of this table to the listener. A malformed event of this
 *  table syncs again: what it changed is unknown. */
export class CharacterFollow {
  private listener: CharacterListener | null = null;

  constructor(
    private readonly transport: RealtimeTransport,
    private readonly campaignId: string,
    private readonly ackTimeoutMs: number,
  ) {}

  /** The event subscriptions, taken for the whole visit (unsubscribed with it). */
  subscriptions(): Unsubscribe[] {
    return [
      this.onEvent(BOARD_EVENTS.charactersChanged, characterChangedEventDto, (event) => ({
        kind: 'characterChanged',
        event,
      })),
      this.onEvent(BOARD_EVENTS.characterRemoved, characterRemovedEventDto, (event) => ({
        kind: 'characterRemoved',
        event,
      })),
    ];
  }

  /** `joined`: the table is joined already, so no join will bring the first sync. */
  follow(listener: CharacterListener, joined: boolean): CharactersHandle {
    this.listener = listener;
    if (joined) void this.sync();
    return { resync: () => void this.sync() };
  }

  stop(): void {
    this.listener = null;
  }

  /** Asks the characters' snapshot; nobody following → nothing asked. */
  async sync(): Promise<void> {
    const listener = this.listener;
    if (!listener) return;
    const update = await this.snapshot();
    if (this.listener === listener) listener(update);
  }

  private async snapshot(): Promise<CharacterUpdate> {
    try {
      const payload = { campaignId: this.campaignId };
      const event = BOARD_EVENTS.syncCharacters;
      const answer = await this.transport.emitWithAck(event, payload, this.ackTimeoutMs);
      return snapshotUpdateOf(answer);
    } catch {
      return { kind: 'charactersFailed', failure: 'offline' };
    }
  }

  private onEvent<E extends Readonly<{ campaignId: string }>>(
    name: string,
    dto: z.ZodType<E>,
    updateOf: (event: E) => CharacterUpdate,
  ): Unsubscribe {
    return this.transport.on(name, (payload) => {
      const parsed = dto.safeParse(payload);
      if (parsed.success && parsed.data.campaignId === this.campaignId) {
        return this.listener?.(updateOf(parsed.data));
      }
      if (!parsed.success && campaignIdOf(payload) === this.campaignId) void this.sync();
    });
  }
}

function snapshotUpdateOf(answer: unknown): CharacterUpdate {
  const parsed = characterSyncAckDto.safeParse(answer);
  if (!parsed.success) return { kind: 'charactersFailed', failure: 'unexpected' };
  if (!parsed.data.ok)
    return { kind: 'charactersFailed', failure: syncFailureOf(parsed.data.error) };
  const { version, characters } = parsed.data;
  return { kind: 'characters', sync: { version, characters } };
}

function campaignIdOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || !('campaignId' in payload)) return null;
  return typeof payload.campaignId === 'string' ? payload.campaignId : null;
}
