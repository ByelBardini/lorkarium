import { ExternalLinkIcon, PanelRightCloseIcon, PanelRightOpenIcon } from 'lucide-react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChatPanel } from '@/features/chat/chat-panel';
import { useChatUnreadMark } from '@/features/chat/chat-unread-mark';
import type { ChatWindowSlot } from '@/features/chat/chat-window-slot';
import { CombatPanel } from '@/features/combat/combat-panel';
import { DicePanel, type DicePanelProps } from '@/features/dice/dice-panel';
import { SessionPresencePanel } from '@/features/sessions/session-presence-panel';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { ChatCommands } from '@/services/chat-commands';
import type { OpenTablesStore } from '@/stores/open-tables-store';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/use-media-query';
import { isRoomTab, useRoomLayout, type RoomLayoutStore } from '@/stores/room-layout-store';
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
    /** The table's cast: "Na mesa" reads the cards and the characters' anchors from it. */
    cast: StoreApi<BoardStore>;
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
  /** The "Chat" tab sends through it; the rest it shares with "Dados". */
  chat: ChatCommands;
  /** Phase 11: the chat docked here (with "Abrir em outra janela") or in another window. */
  chatWindow?: ChatWindowSlot | null;
  diceWindow?: ChatWindowSlot | null;
}>;

const PANEL_TITLE = 'Painel da mesa';

/** The side panel of the room: a 360px column over the right of the board on tablet and
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
      className="absolute inset-y-0 right-0 flex w-90 flex-col border-l border-border bg-panel"
    >
      <RoomPanelTabs {...props} />
    </aside>
  );
}

function PhonePanel(props: RoomPanelProps): React.JSX.Element {
  const unread = useChatUnreadMark(props.dice.openTables, props.dice.campaignId);
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-describedby={unread.describedBy}
          className="absolute right-3 bottom-3 bg-panel"
        >
          Painel
          {unread.mark}
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
  const unread = useChatUnreadMark(props.dice.openTables, props.dice.campaignId);
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if (isRoomTab(value)) roomLayout.getState().showTab(value);
      }}
      className="min-h-0 flex-1 px-4"
    >
      <div className="flex items-center gap-1 border-b border-border">
        <TabsList className="min-w-0 flex-1 border-b-0">
          <TabsTrigger value="combat">Combate</TabsTrigger>
          <TabsTrigger value="people">
            Na mesa
            {table && <OnlinePill presence={table.presence} />}
          </TabsTrigger>
          <TabsTrigger value="dice">Dados</TabsTrigger>
          <TabsTrigger value="chat" aria-describedby={unread.describedBy}>
            Chat
            {unread.mark}
          </TabsTrigger>
        </TabsList>
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
      <TabsContent value="combat" className="flex flex-col py-4">
        {table && (
          <CombatPanel
            table={table}
            interaction={props.interaction}
            isMaster={props.isMaster}
            onEditToken={props.onEditToken}
          />
        )}
      </TabsContent>
      <TabsContent value="people" className="-mx-4 overflow-y-auto px-4 py-4">
        {table && (
          <SessionPresencePanel
            store={table.presence}
            board={props.group?.board ?? table.board}
            cast={table.cast}
            interaction={props.group?.interaction ?? props.interaction}
            isMaster={props.isMaster}
            ownerId={props.ownerId}
            clock={props.clock}
          />
        )}
      </TabsContent>
      <TabsContent value="dice" className="-mx-1 overflow-y-auto px-1 py-4">
        <RoomDice {...props} />
      </TabsContent>
      <TabsContent value="chat" className="flex flex-col max-md:h-[60svh]">
        <RoomChat {...props} />
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

function RoomChat({ dice, chat, table, chatWindow }: RoomPanelProps): React.JSX.Element {
  const { campaignId, role, sessionStore, openTables, services } = dice;
  return (
    <ChatPanel
      campaignId={campaignId}
      role={role}
      sessionStore={sessionStore}
      openTables={openTables}
      presence={table?.presence ?? null}
      board={table?.board ?? null}
      services={{ ...services, chat }}
      window={chatWindow ?? null}
    />
  );
}

// The room's top bar already says "N online" to the screen reader: the pill is only for the eye.
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

export type PanelToggleProps = Readonly<{
  roomLayout: StoreApi<RoomLayoutStore>;
  /** The table whose chat counter "Abrir painel" carries while the panel is collapsed. */
  openTables: StoreApi<OpenTablesStore>;
  campaignId: string;
}>;

/** "Recolher painel" ↔ "Abrir painel", remembered by the layout store; only beside the board.
 *  Collapsed, it carries the chat's unread counter.
 *
 *  Example: `<PanelToggle roomLayout={roomLayout} openTables={openTables} campaignId={campaign.id} />` */
export function PanelToggle(props: PanelToggleProps): React.JSX.Element | null {
  const { roomLayout } = props;
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const open = useRoomLayout(roomLayout, (state) => state.panel === 'open');
  const unread = useChatUnreadMark(props.openTables, props.campaignId);
  if (!desktop) return null;
  const Icon = open ? PanelRightCloseIcon : PanelRightOpenIcon;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={open ? 'Recolher painel' : 'Abrir painel'}
      aria-expanded={open}
      aria-describedby={open ? undefined : unread.describedBy}
      onClick={() => roomLayout.getState().togglePanel()}
      className={
        open || unread.mark === null
          ? 'text-muted-foreground'
          : 'w-auto px-1.5 text-muted-foreground'
      }
    >
      <Icon aria-hidden="true" />
      {!open && unread.mark}
    </Button>
  );
}
