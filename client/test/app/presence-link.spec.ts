import type { PresenceVisibilityDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { linkPresenceChoice } from '@/app/presence-link';
import { AccountRealtime } from '@/services/account-realtime';
import type { PresenceCommands } from '@/services/presence-commands';
import { createPresenceChoiceStore } from '@/stores/presence-choice-store';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { StorageFake } from '../support/storage-fake';

class PresenceCommandsFake implements PresenceCommands {
  readonly sent: PresenceVisibilityDto[] = [];
  setVisibility(visibility: PresenceVisibilityDto): void {
    this.sent.push(visibility);
  }
}

function linked() {
  const transport = new RealtimeTransportFake();
  const account = new AccountRealtime(transport, () => undefined);
  const choice = createPresenceChoiceStore(new StorageFake());
  const commands = new PresenceCommandsFake();
  const unlink = linkPresenceChoice(account, choice, commands);
  account.start();
  return { transport, choice, commands, unlink };
}

describe('linkPresenceChoice', () => {
  it('every connection, reconnections included, sends the stored choice', () => {
    const { transport, choice, commands } = linked();
    choice.getState().choose('invisible');
    transport.lifecycle({ kind: 'connected' });
    transport.lifecycle({ kind: 'disconnected', willRetry: true });
    transport.lifecycle({ kind: 'connected' });
    expect(commands.sent).toEqual(['invisible', 'invisible']);
  });

  it('a change while connected goes at once; offline it waits for the connection', () => {
    const { transport, choice, commands } = linked();
    choice.getState().choose('invisible');
    expect(commands.sent).toEqual([]);
    transport.lifecycle({ kind: 'connected' });
    choice.getState().choose('online');
    expect(commands.sent).toEqual(['invisible', 'online']);
  });

  it('unlinked, nothing more is sent', () => {
    const { transport, commands, unlink } = linked();
    unlink();
    transport.lifecycle({ kind: 'connected' });
    expect(commands.sent).toEqual([]);
  });
});
