import { ExternalLinkIcon } from 'lucide-react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ChatWindowSlot } from '@/features/chat/chat-window-slot';
import { CombatPanel } from '@/features/combat/combat-panel';
import { DicePanel, type DicePanelProps } from '@/features/dice/dice-panel';
import { SessionPresencePanel } from '@/features/sessions/session-presence-panel';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import type { CharactersStore } from '@/stores/characters-store';
import type { InteractionClock } from '@/lib/interaction-clock';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/use-media-query';
import { isRoomTab, useRoomLayout, type RoomLayoutStore } from '@/stores/room-layout-store';
import { ROOM_TAB_NAME } from './board-messages';
import { RoomRail } from './room-rail';
import {
  selectOnlineCount,
  useTablePresence,
  type TablePresenceStore,
} from '@/stores/table-presence-store';

export type RoomPanelProps = Readonly<{
  roomLayout: StoreApi<RoomLayoutStore>;
  /** The presence and the board of the tab shown ("Combate" follows it). */
  table: Readonly<{
    presence: StoreApi<TablePresenceStore>;
    board: StoreApi<BoardStore>;
    /** The table's characters: "Na mesa" and the dock read them. */
    characters: StoreApi<CharactersStore>;
  }> | null;
  interaction: StoreApi<BoardInteractionStore>;
  /** The group grid's tab: "Na mesa" always shows the group, whatever tab is shown. */
  group: Readonly<{
    board: StoreApi<BoardStore>;
    interaction: StoreApi<BoardInteractionStore>;
  }> | null;
  isMaster: boolean;
  /** The campaign's creator: "Na mesa" names the owner. */
  ownerId: string;
  onEditToken: (tokenId: string) => void;
  /** The browser's time, for "ausente há N min". */
  clock: InteractionClock;
  /** The "Dados" tab (its presence is the table's, from `table`). */
  dice: Omit<DicePanelProps, 'presence'>;
  diceWindow?: ChatWindowSlot | null;
}>;

const PANEL_TITLE = 'Painel da mesa';

/** The side panel of the room: on tablet and desktop the rail of icons (`RoomRail`) and, when
 *  open, a 360px column over the right of the board beside it, titled by its tab; on a phone a
 *  bottom sheet opened by "Painel", with its own tabs.
 *
 *  Example: `<RoomSidePanel roomLayout={roomLayout} presence={presence} />` */
export function RoomSidePanel(props: RoomPanelProps): React.JSX.Element | null {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const panel = useRoomLayout(props.roomLayout, (state) => state.panel);
  if (!desktop) return <PhonePanel {...props} />;
  return (
    <>
      {panel === 'open' && (
        <aside
          aria-label={PANEL_TITLE}
          className="absolute inset-y-0 right-[46px] flex w-90 flex-col border-l border-border bg-panel"
        >
          <RoomPanelTabs {...props} withList={false} />
        </aside>
      )}
      <RoomRail roomLayout={props.roomLayout} presence={props.table?.presence ?? null} />
    </>
  );
}

// The chat's counter is not here: "Chat" (`ChatPhoneButton`) is its own button beside this one.
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
        <RoomPanelTabs {...props} withList />
      </SheetContent>
    </Sheet>
  );
}

type PanelTabsProps = RoomPanelProps & Readonly<{ withList: boolean }>;

// Beside the board the rail picks the tab, so the panel only names it; the phone's sheet has no
// rail and keeps the list.
function RoomPanelTabs(props: PanelTabsProps): React.JSX.Element {
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
      <div className="flex items-center gap-1 border-b border-border">
        {props.withList ? (
          <TabsList className="min-w-0 flex-1 border-b-0">
            <TabsTrigger value="combat">Combate</TabsTrigger>
            <TabsTrigger value="people">
              Na mesa
              {table && <OnlinePill presence={table.presence} />}
            </TabsTrigger>
            <TabsTrigger value="dice">Dados</TabsTrigger>
          </TabsList>
        ) : (
          <h2 className="h-10 min-w-0 flex-1 content-center font-display text-base font-semibold">
            {ROOM_TAB_NAME[tab]}
          </h2>
        )}
        {tab === 'dice' && props.diceWindow?.kind === 'docked' && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Abrir em outra janela"
            title="Abrir Dados em outra janela"
            onClick={props.diceWindow.open}
            className="shrink-0 text-muted-foreground"
          >
            <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
          </Button>
        )}
      </div>
      <TabsContent value="combat" aria-label={ROOM_TAB_NAME.combat} className="flex flex-col py-4">
        {table && (
          <CombatPanel
            table={table}
            interaction={props.interaction}
            isMaster={props.isMaster}
            onEditToken={props.onEditToken}
          />
        )}
      </TabsContent>
      <TabsContent
        value="people"
        aria-label={ROOM_TAB_NAME.people}
        className="-mx-4 overflow-y-auto px-4 py-4"
      >
        {table && (
          <SessionPresencePanel
            store={table.presence}
            board={props.group?.board ?? table.board}
            characters={table.characters}
            interaction={props.group?.interaction ?? props.interaction}
            isMaster={props.isMaster}
            ownerId={props.ownerId}
            clock={props.clock}
          />
        )}
      </TabsContent>
      <TabsContent
        value="dice"
        aria-label={ROOM_TAB_NAME.dice}
        className="-mx-1 overflow-y-auto px-1 py-4"
      >
        <RoomDice {...props} />
      </TabsContent>
    </Tabs>
  );
}

function RoomDice({ dice, table, diceWindow }: RoomPanelProps): React.JSX.Element {
  if (diceWindow?.kind === 'detached')
    return (
      <section
        aria-label="Dados"
        className="flex flex-col items-start gap-3 py-6 text-sm text-muted-foreground"
      >
        <p>Dados abertos em outra janela</p>
        <Button variant="outline" size="sm" onClick={diceWindow.bringBack}>
          Trazer de volta
        </Button>
      </section>
    );
  return (
    <>
      {diceWindow?.kind === 'docked' && diceWindow.notice && (
        <p role="status" className="mb-3 text-xs text-muted-foreground">
          {diceWindow.notice}
        </p>
      )}
      <DicePanel {...dice} presence={table?.presence ?? null} />
    </>
  );
}

// Beside the board the rail says "N online"; on the phone's sheet the pill is only for the eye.
function OnlinePill({ presence }: Readonly<{ presence: StoreApi<TablePresenceStore> }>) {
  const online = useTablePresence(presence, selectOnlineCount);
  return (
    <span
      aria-hidden="true"
      className="inline-grid h-5 min-w-5 place-items-center rounded-full bg-primary/15 px-1.5 text-[11px] text-primary tabular-nums"
    >
      {online}
    </span>
  );
}
