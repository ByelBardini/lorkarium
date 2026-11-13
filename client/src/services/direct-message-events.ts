import {
  DM_EVENTS,
  dmSentDto,
  dmTypingFromDto,
  type DmSentDto,
  type DmTypingFromDto,
} from '@lorkarium/contracts';
import type { RealtimeTransport, Unsubscribe } from './realtime-transport';

/** What reaches the direct messages store from the account socket, already validated. */
export type DirectMessageEvent =
  | Readonly<{ kind: 'sent'; event: DmSentDto }>
  | Readonly<{ kind: 'typingFrom'; event: DmTypingFromDto }>;

/** Subscribes `dm:sent` and `dm:typingFrom`; a payload outside its DTO drops silently (nothing
 *  is saved, so there is nothing to sync again).
 *
 *  Example: `const stop = subscribeDirectMessageEvents(transport, (event) => dms.getState().apply(event))` */
export function subscribeDirectMessageEvents(
  transport: RealtimeTransport,
  listener: (event: DirectMessageEvent) => void,
): Unsubscribe {
  const subscriptions = [
    transport.on(DM_EVENTS.sent, (payload) => {
      const parsed = dmSentDto.safeParse(payload);
      if (parsed.success) listener({ kind: 'sent', event: parsed.data });
    }),
    transport.on(DM_EVENTS.typingFrom, (payload) => {
      const parsed = dmTypingFromDto.safeParse(payload);
      if (parsed.success) listener({ kind: 'typingFrom', event: parsed.data });
    }),
  ];
  return () => {
    for (const unsubscribe of subscriptions) unsubscribe();
  };
}
