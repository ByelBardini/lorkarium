import { beforeEach, describe, expect, it } from 'vitest';
import {
  subscribeDirectMessageEvents,
  type DirectMessageEvent,
} from '@/services/direct-message-events';
import { BIA, dmSent } from '../support/friends-fixtures';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';

const AT = '2026-11-12T10:00:00.000Z';

describe('subscribeDirectMessageEvents', () => {
  let transport: RealtimeTransportFake;
  let events: DirectMessageEvent[];
  let stop: () => void;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    events = [];
    stop = subscribeDirectMessageEvents(transport, (event) => events.push(event));
  });

  it('a valid dm:sent and dm:typingFrom reach the listener', () => {
    const message = dmSent();
    transport.serverEmits('dm:sent', message);
    transport.serverEmits('dm:typingFrom', { fromUserId: BIA.userId, at: AT });
    expect(events).toEqual([
      { kind: 'sent', event: message },
      { kind: 'typingFrom', event: { fromUserId: BIA.userId, at: AT } },
    ]);
  });

  it('payloads outside the DTO drop silently', () => {
    transport.serverEmits('dm:sent', { ...dmSent(), text: '' });
    transport.serverEmits('dm:typingFrom', { fromUserId: 'bia' });
    expect(events).toEqual([]);
  });

  it('after unsubscribing nothing reaches the listener', () => {
    stop();
    transport.serverEmits('dm:sent', dmSent());
    expect(events).toEqual([]);
  });
});
