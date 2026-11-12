import { useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { OpenTable } from '@/stores/open-tables-store';
import { useRoomLayout, type RoomLayoutStore } from '@/stores/room-layout-store';
import { ChatAnnouncer } from './chat-announcer';
import type { ChatDockPanelProps } from './chat-dock';
import { ChatPanel } from './chat-panel';
import { useChatUnreadMark } from './chat-unread-mark';
import type { ChatWindowSlot } from './chat-window-slot';
import { useChatPeople, useOpenTableOf } from './use-chat-people';

export type ChatPhoneButtonProps = Readonly<{
  /** What the sheet shows (the whole `ChatPanel`); `window` is the room's chat window slot. */
  panel: ChatDockPanelProps;
  /** Focus mode hides "Painel": the button takes its corner. */
  roomLayout: StoreApi<RoomLayoutStore>;
}>;

const CHAT_SHEET_TITLE = 'Chat da mesa';

/** The chat of the room on a phone: "Chat" beside "Painel" at the board's corner, with the unread
 *  counter (gold for a mention or a whisper to the viewer), opening a bottom sheet with the whole
 *  `ChatPanel` (its conversation is read while it is open). A phone has no other window: the sheet
 *  never offers one. Mount it inside the board's positioned box, below `md`.
 *
 *  Example: `<ChatPhoneButton panel={{ ...chatPanelProps, window: chatWindow.slot }} roomLayout={roomLayout} />` */
export function ChatPhoneButton(props: ChatPhoneButtonProps): React.JSX.Element | null {
  const table = useOpenTableOf(props.panel.openTables, props.panel.campaignId);
  if (table === null) return null;
  return <TableChatButton {...props} table={table} />;
}

type TableChatButtonProps = ChatPhoneButtonProps & Readonly<{ table: OpenTable }>;

function TableChatButton({ panel, roomLayout, table }: TableChatButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const unread = useChatUnreadMark(panel.openTables, panel.campaignId);
  const focus = useRoomLayout(roomLayout, (state) => state.focus);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-describedby={unread.describedBy}
          // "Painel" (`right-3`, about 58 px wide) is on the right; in focus mode it is gone.
          className={cn('absolute bottom-3 bg-panel', focus ? 'right-3' : 'right-21')}
        >
          Chat
          {unread.mark}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[70svh] bg-panel px-4 pt-11 pb-4">
        <SheetTitle className="sr-only">{CHAT_SHEET_TITLE}</SheetTitle>
        <ChatPanel {...panel} window={phoneWindowOf(panel.window)} />
      </SheetContent>
      {!open && <ClosedAnnouncer panel={panel} table={table} />}
    </Sheet>
  );
}

// Only a chat already detached (from a wider screen) keeps its slot: the sheet brings it back.
function phoneWindowOf(slot: ChatWindowSlot | null | undefined): ChatWindowSlot | null {
  return slot?.kind === 'detached' ? slot : null;
}

type ClosedAnnouncerProps = Readonly<{ panel: ChatDockPanelProps; table: OpenTable }>;

// With the sheet closed its `ChatPanel` is gone, and with it its announcer: the button speaks.
function ClosedAnnouncer({ panel, table }: ClosedAnnouncerProps): React.JSX.Element {
  const people = useChatPeople(panel.presence, panel.sessionStore);
  return <ChatAnnouncer chat={table.chat} people={people} />;
}
