import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { TABLE_CONVERSATION_KEY, type ChatConversationKey } from '@/lib/chat-conversations';
import type { InteractionClock } from '@/lib/interaction-clock';
import { cn } from '@/lib/utils';
import type { OpenTable } from '@/stores/open-tables-store';
import {
  onChatFocusRequest,
  useRoomLayout,
  type RoomLayoutStore,
} from '@/stores/room-layout-store';
import { ChatAnnouncer } from './chat-announcer';
import { ChatDockBar } from './chat-dock-bar';
import { ChatDrawer } from './chat-drawer';
import { ChatImportantNotices } from './chat-important-notices';
import type { ChatPanelProps } from './chat-panel';
import { ChatPreviewStack } from './chat-preview-stack';
import { useChatNotices, type ChatNoticeItem, type ChatNotices } from './use-chat-notices';
import { useChatPeople, useOpenTableOf, type ChatPeople } from './use-chat-people';

/** What the drawer's `ChatPanel` gets: the dock picks the conversation it opens on. */
export type ChatDockPanelProps = Omit<ChatPanelProps, 'initialConversation'>;

export type ChatDockProps = ChatDockPanelProps &
  Readonly<{
    /** The chat bar's state and the drawer height; the panel and focus mode place the bar. */
    roomLayout: StoreApi<RoomLayoutStore>;
    /** The clock the previews leave on (the room's `interactionClock`). */
    clock: InteractionClock;
  }>;

/** The chat of the room at the foot of the board, for every role: a thin bar with the latest
 *  message, the unread counter and "Abrir chat", the previews of the new messages above it, the
 *  gold notices of the mentions and whispers to the viewer on top (with the drawer open too),
 *  and the translucent drawer with the whole `ChatPanel` over the grid when open (it focuses the
 *  composer as it mounts; `requestChatFocus`, the T, opens it). With the chat in another window
 *  (`window` detached) the bar only offers to bring it back, and T does nothing. Mount it inside
 *  the board's positioned box.
 *
 *  Example: `<ChatDock {...chatPanelProps} window={chatWindow.slot} roomLayout={roomLayout} clock={deps.interactionClock} />` */
export function ChatDock({ roomLayout, clock, ...panel }: ChatDockProps): React.JSX.Element | null {
  const table = useOpenTableOf(panel.openTables, panel.campaignId);
  if (table === null) return null;
  return <TableDock panel={panel} roomLayout={roomLayout} clock={clock} table={table} />;
}

type TableDockProps = Readonly<{
  panel: ChatDockPanelProps;
  roomLayout: StoreApi<RoomLayoutStore>;
  clock: InteractionClock;
  table: OpenTable;
}>;

function TableDock(props: TableDockProps): React.JSX.Element {
  const { panel, roomLayout, clock, table } = props;
  const people = useChatPeople(panel.presence, panel.sessionStore);
  const notices = useChatNotices({ chat: table.chat, clock, viewerId: people.viewerId });
  const drawer = useDrawerRequest(roomLayout);
  const open = useRoomLayout(roomLayout, (state) => state.chat === 'open');
  const docked = panel.window?.kind !== 'detached';
  useOpenOnFocusRequest(roomLayout, docked);
  const parts: DockParts = { ...props, people, drawer };
  const openNotice = (item: ChatNoticeItem): void => {
    notices.dismiss(item.id);
    drawer.openAt(item.key);
  };
  return (
    <DockLane roomLayout={roomLayout}>
      {docked && (
        <ChatImportantNotices
          importants={notices.importants}
          people={people}
          tabs={table.tabs}
          onOpen={openNotice}
        />
      )}
      {docked && !open && (
        <ClosedNotices table={table} people={people} notices={notices} onOpen={drawer.openAt} />
      )}
      {docked && open ? <OpenDrawer {...parts} /> : <ClosedBar {...parts} />}
    </DockLane>
  );
}

// Detached, the composer is in the other window: T leaves the drawer (and its stored state) alone.
function useOpenOnFocusRequest(roomLayout: StoreApi<RoomLayoutStore>, docked: boolean): void {
  useEffect(() => {
    if (!docked) return;
    return onChatFocusRequest(roomLayout, () => roomLayout.getState().openChat());
  }, [roomLayout, docked]);
}

type DockParts = TableDockProps & Readonly<{ people: ChatPeople; drawer: DrawerRequest }>;

function OpenDrawer({ panel, roomLayout, drawer }: DockParts): React.JSX.Element {
  return (
    <ChatDrawer
      key={drawer.serial}
      panel={{ ...panel, initialConversation: drawer.key }}
      roomLayout={roomLayout}
      onClose={drawer.collapse}
    />
  );
}

function ClosedBar({ panel, roomLayout, table, people, drawer }: DockParts): React.JSX.Element {
  return (
    <ChatDockBar
      panel={panel}
      table={table}
      people={people}
      onOpen={() => roomLayout.getState().openChat()}
      openButtonRef={drawer.barButtonRef}
    />
  );
}

type ClosedNoticesProps = Readonly<{
  table: OpenTable;
  people: ChatPeople;
  notices: ChatNotices;
  onOpen: (key: ChatConversationKey) => void;
}>;

// With the drawer closed its `ChatPanel` is gone, and with it its announcer: the dock speaks.
function ClosedNotices({ table, people, notices, onOpen }: ClosedNoticesProps): React.JSX.Element {
  return (
    <>
      <ChatPreviewStack
        previews={plainPreviewsOf(notices)}
        nameOf={people.nameOf}
        onOpen={onOpen}
      />
      <ChatAnnouncer chat={table.chat} people={people} />
    </>
  );
}

// An important message is already a notice above: the same message twice would be noise.
function plainPreviewsOf({ previews, importants }: ChatNotices): readonly ChatNoticeItem[] {
  if (importants.length === 0) return previews;
  return previews.filter((preview) => !importants.some((item) => item.id === preview.id));
}

type DockLaneProps = Readonly<{ roomLayout: StoreApi<RoomLayoutStore>; children: React.ReactNode }>;

// The whole height of the board, so the drawer measures the board from its parent; centred on the
// free strip: right of the toolbar (gone in focus mode), left of the open panel (360px).
function DockLane({ roomLayout, children }: DockLaneProps): React.JSX.Element {
  const focus = useRoomLayout(roomLayout, (state) => state.focus);
  const panelShown = useRoomLayout(roomLayout, (state) => state.panel === 'open' && !state.focus);
  return (
    <div
      data-testid="chat-dock"
      className={cn(
        'pointer-events-none absolute inset-y-0 flex flex-col items-center justify-end gap-2 px-4 pb-3',
        focus ? 'left-0' : 'left-16.5',
        panelShown ? 'right-90' : 'right-0',
      )}
    >
      {children}
    </div>
  );
}

type DrawerRequest = Readonly<{
  /** The conversation the drawer opens on, and the serial that remounts it to pick another. */
  key: ChatConversationKey;
  serial: number;
  openAt: (key: ChatConversationKey) => void;
  /** Closes the drawer from inside it: the focus goes back to "Abrir chat". */
  collapse: () => void;
  barButtonRef: (button: HTMLButtonElement | null) => void;
}>;

// A `ChatPanel` picks its conversation once, as it mounts: opening at another one remounts it.
function useDrawerRequest(roomLayout: StoreApi<RoomLayoutStore>): DrawerRequest {
  const [opening, setOpening] = useState<Readonly<{ key: ChatConversationKey; serial: number }>>({
    key: TABLE_CONVERSATION_KEY,
    serial: 0,
  });
  const focusBar = useRef(false);
  const openAt = (key: ChatConversationKey): void => {
    setOpening((last) => ({ key, serial: last.serial + 1 }));
    roomLayout.getState().openChat();
  };
  const collapse = (): void => {
    focusBar.current = true;
    setOpening((last) => ({ ...last, key: TABLE_CONVERSATION_KEY }));
    roomLayout.getState().closeChat();
  };
  const barButtonRef = useCallback((button: HTMLButtonElement | null) => {
    if (!button || !focusBar.current) return;
    focusBar.current = false;
    button.focus();
  }, []);
  return { ...opening, openAt, collapse, barButtonRef };
}
