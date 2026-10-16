import { ExpandIcon, ShrinkIcon } from 'lucide-react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { useRoomLayout, type RoomLayoutStore } from '@/stores/room-layout-store';

/** "Modo foco": stays on screen in focus mode, so there is always a way back besides Esc.
 *
 *  Example: `<FocusToggle roomLayout={roomLayout} />` */
export function FocusToggle({
  roomLayout,
}: Readonly<{ roomLayout: StoreApi<RoomLayoutStore> }>): React.JSX.Element {
  const focus = useRoomLayout(roomLayout, (state) => state.focus);
  const Icon = focus ? ShrinkIcon : ExpandIcon;
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Modo foco"
      aria-pressed={focus}
      title={focus ? 'Sair do modo foco (Esc)' : 'Modo foco (F)'}
      onClick={() => roomLayout.getState().toggleFocus()}
      className="absolute top-3 left-3 bg-panel"
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
