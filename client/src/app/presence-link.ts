import type { StoreApi } from 'zustand/vanilla';
import type { AccountRealtime } from '@/services/account-realtime';
import type { PresenceCommands } from '@/services/presence-commands';
import type { Unsubscribe } from '@/services/realtime-transport';
import type { PresenceChoiceStore } from '@/stores/presence-choice-store';

/** Sends the chosen status at every connection of the account (the server forgets it with the
 *  socket) and whenever the person changes it while connected.
 *
 *  Example: `linkPresenceChoice(accountRealtime, presenceChoice, new RealtimePresenceCommands(realtime, newActionId))` */
export function linkPresenceChoice(
  account: AccountRealtime,
  choice: StoreApi<PresenceChoiceStore>,
  commands: PresenceCommands,
): Unsubscribe {
  const send = (): void => commands.setVisibility(choice.getState().choice);
  const stopConnected = account.onConnected(send);
  const stopChoice = choice.subscribe((state, previous) => {
    if (state.choice !== previous.choice && account.status() === 'live') send();
  });
  return () => {
    stopConnected();
    stopChoice();
  };
}
