import type { StoreApi } from 'zustand/vanilla';
import { useChatPreferences, type ChatPreferencesStore } from '@/stores/chat-preferences-store';
import { DeviceSwitch } from './device-switch';

export type ChatDeviceSwitchProps = Readonly<{
  chatPreferences: StoreApi<ChatPreferencesStore>;
}>;

/** "Som do chat" in "Minha conta", right below "Som dos dados": whether this device rings a
 *  mention or a whisper. Kept on the device, so it changes at once, outside the bar of changes.
 *
 *  Example: `<ChatDeviceSwitch chatPreferences={deps.chatPreferences} />` */
export function ChatDeviceSwitch({ chatPreferences }: ChatDeviceSwitchProps): React.JSX.Element {
  const sound = useChatPreferences(chatPreferences, (state) => state.sound);
  return (
    <DeviceSwitch
      label="Som do chat"
      hint="Toca um aviso curto quando alguém te menciona com @ ou te sussurra. Vale só neste aparelho."
      checked={sound}
      onCheckedChange={(checked) => chatPreferences.getState().setSound(checked)}
    />
  );
}
