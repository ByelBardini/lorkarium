import { PanelRightCloseIcon, PanelRightOpenIcon } from 'lucide-react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CombatHeader } from '@/features/combat/combat-header';
import { CombatantList } from '@/features/combat/combatant-list';
import { SessionPresencePanel } from '@/features/sessions/session-presence-panel';
import { SceneTokenList } from '@/features/tokens/scene-token-list';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/use-media-query';
import { isRoomTab, useRoomLayout, type RoomLayoutStore } from '@/stores/room-layout-store';
import type { TablePresenceStore } from '@/stores/table-presence-store';

export type RoomPanelProps = Readonly<{
  roomLayout: StoreApi<RoomLayoutStore>;
  table: Readonly<{ presence: StoreApi<TablePresenceStore>; board: StoreApi<BoardStore> }> | null;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
  onEditToken: (tokenId: string) => void;
}>;

const PANEL_TITLE = 'Painel da mesa';

/** The side panel of the room: a 320px column over the right of the board on tablet and
 *  desktop (when open), and a bottom sheet opened by "Painel" on a phone.
 *
 *  Example: `<RoomSidePanel roomLayout={roomLayout} presence={presence} />` */
export function RoomSidePanel(props: RoomPanelProps): React.JSX.Element | null {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const panel = useRoomLayout(props.roomLayout, (state) => state.panel);
  if (!desktop) return <PhonePanel {...props} />;
  if (panel === 'closed') return null;
  return (
    <aside
      aria-label={PANEL_TITLE}
      className="absolute inset-y-0 right-0 flex w-80 flex-col border-l border-border bg-panel"
    >
      <RoomPanelTabs {...props} />
    </aside>
  );
}

function PhonePanel(props: RoomPanelProps): React.JSX.Element {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="absolute right-3 bottom-3 bg-panel">
          Painel
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[70svh] bg-panel px-4 pb-6">
        <SheetTitle className="sr-only">{PANEL_TITLE}</SheetTitle>
        <RoomPanelTabs {...props} />
      </SheetContent>
    </Sheet>
  );
}

function RoomPanelTabs(props: RoomPanelProps): React.JSX.Element {
  const { roomLayout, table } = props;
  const tab = useRoomLayout(roomLayout, (state) => state.tab);
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if (isRoomTab(value)) roomLayout.getState().showTab(value);
      }}
      className="min-h-0 flex-1 px-4"
    >
      <TabsList>
        <TabsTrigger value="combat">Combate</TabsTrigger>
        <TabsTrigger value="people">Na mesa</TabsTrigger>
      </TabsList>
      <TabsContent value="combat" className="flex flex-col gap-4 overflow-y-auto py-4">
        {table && (
          <CombatHeader
            board={table.board}
            interaction={props.interaction}
            isMaster={props.isMaster}
          />
        )}
        {table && (
          <CombatOrScene
            table={table}
            interaction={props.interaction}
            isMaster={props.isMaster}
            onEditToken={props.onEditToken}
          />
        )}
      </TabsContent>
      <TabsContent value="people" className="overflow-y-auto py-4">
        {table && <SessionPresencePanel store={table.presence} />}
      </TabsContent>
    </Tabs>
  );
}

type CombatOrSceneProps = Readonly<{
  table: NonNullable<RoomPanelProps['table']>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
  onEditToken: (tokenId: string) => void;
}>;

// In combat the tracker; out of it, "Na cena".
function CombatOrScene({ table, interaction, isMaster, onEditToken }: CombatOrSceneProps) {
  const inCombat = useBoard(table.board, (state) => state.board?.combat != null);
  if (inCombat) {
    return (
      <CombatantList
        board={table.board}
        interaction={interaction}
        isMaster={isMaster}
        onEditToken={onEditToken}
      />
    );
  }
  return (
    <SceneTokenList
      board={table.board}
      presence={table.presence}
      interaction={interaction}
      isMaster={isMaster}
      onEdit={onEditToken}
    />
  );
}

/** "Recolher painel" ↔ "Abrir painel", remembered by the layout store; only beside the board.
 *
 *  Example: `<PanelToggle roomLayout={roomLayout} />` */
export function PanelToggle({
  roomLayout,
}: Readonly<{ roomLayout: StoreApi<RoomLayoutStore> }>): React.JSX.Element | null {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const open = useRoomLayout(roomLayout, (state) => state.panel === 'open');
  if (!desktop) return null;
  const Icon = open ? PanelRightCloseIcon : PanelRightOpenIcon;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={open ? 'Recolher painel' : 'Abrir painel'}
      aria-expanded={open}
      onClick={() => roomLayout.getState().togglePanel()}
      className="text-muted-foreground"
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
