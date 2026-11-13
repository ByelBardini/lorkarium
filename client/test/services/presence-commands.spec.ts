import { describe, expect, it } from 'vitest';
import { RealtimePresenceCommands } from '@/services/presence-commands';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';

const ACTION_ID = '5f607182-93a4-4bb5-8cc6-e7f8091a2b3c';

describe('RealtimePresenceCommands', () => {
  it('connected, sends presence:setVisibility with a new action id', () => {
    const transport = new RealtimeTransportFake();
    transport.lifecycle({ kind: 'connected' });
    new RealtimePresenceCommands(transport, () => ACTION_ID).setVisibility('invisible');
    expect(transport.sent).toEqual([
      {
        event: 'presence:setVisibility',
        payload: { actionId: ACTION_ID, visibility: 'invisible' },
      },
    ]);
  });

  it('with the socket down, sends nothing (the next connection does)', () => {
    const transport = new RealtimeTransportFake();
    new RealtimePresenceCommands(transport, () => ACTION_ID).setVisibility('online');
    expect(transport.sent).toEqual([]);
  });

  it('a lost ack is swallowed', async () => {
    const transport = new RealtimeTransportFake();
    transport.lifecycle({ kind: 'connected' });
    new RealtimePresenceCommands(transport, () => ACTION_ID).setVisibility('online');
    await expect(transport.timeOutAck('presence:setVisibility')).resolves.toBeUndefined();
  });
});
