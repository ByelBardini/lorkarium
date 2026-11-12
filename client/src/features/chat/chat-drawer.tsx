import { ChevronDownIcon } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { CHAT_DRAWER_MIN_HEIGHT, clampChatDrawerHeight } from '@/lib/chat-drawer-height';
import { trackPointerDrag, type DragPoint } from '@/lib/pointer-drag';
import {
  onChatFocusRequest,
  useRoomLayout,
  type RoomLayoutStore,
} from '@/stores/room-layout-store';
import { ChatPanel, type ChatPanelProps } from './chat-panel';

/** One arrow press on the handle grows or shrinks the drawer this many pixels. */
export const CHAT_DRAWER_STEP = 24;

export type ChatDrawerProps = Readonly<{
  panel: ChatPanelProps;
  /** The drawer height (`chatHeight`, fitted to the board as it is drawn) and the requests for
   *  the composer (T). */
  roomLayout: StoreApi<RoomLayoutStore>;
  /** "Recolher chat", or Esc with the focus inside. */
  onClose: () => void;
}>;

/** The open chat over the grid: a translucent box with the whole `ChatPanel`, a handle on top
 *  on its top edge that sets its height (at least 180 px, at most 70% of the board: its parent is as tall as the
 *  board) and "Recolher chat" at the end of the chat's header line. It focuses the composer as it mounts and on each `requestChatFocus`
 *  (T with the focus elsewhere). Esc inside it closes it and
 *  never reaches the room's shortcuts (on `window`); an Esc someone inside already took (the
 *  composer's suggestions, a menu, a dialog) closes only that.
 *
 *  Example: `<ChatDrawer panel={{ ...chatPanelProps, initialConversation: key }} roomLayout={roomLayout} onClose={collapse} />` */
export function ChatDrawer({ panel, roomLayout, onClose }: ChatDrawerProps): React.JSX.Element {
  const ref = useRef<HTMLElement>(null);
  const boardHeight = useParentHeight(ref);
  const stored = useRoomLayout(roomLayout, (state) => state.chatHeight);
  const height = clampChatDrawerHeight(stored, boardHeight);
  const fit = (wanted: number): void =>
    roomLayout.getState().setChatHeight(clampChatDrawerHeight(wanted, boardHeight));
  useComposerFocus(ref, roomLayout);
  return (
    <section
      ref={ref}
      aria-label="Conversa"
      style={{ height }}
      onKeyDown={(event) => closeOnEscape(event, onClose)}
      className="pointer-events-auto relative flex w-full max-w-190 flex-col rounded-sm border border-border bg-panel/95 px-3 pt-1 backdrop-blur"
    >
      <ChatDrawerHandle height={height} boardHeight={boardHeight} onChange={fit} />
      <ChatPanel {...panel} headerEnd={<CollapseButton onClose={onClose} />} />
    </section>
  );
}

function CollapseButton({ onClose }: Readonly<{ onClose: () => void }>): React.JSX.Element {
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Recolher chat"
      title="Recolher chat (Esc)"
      onClick={onClose}
      className="ml-1 shrink-0"
    >
      <ChevronDownIcon aria-hidden="true" />
    </Button>
  );
}

// React's root is under `window`: stopping the Esc here keeps it from the room's shortcuts.
function closeOnEscape(event: KeyboardEvent<HTMLElement>, onClose: () => void): void {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
  event.preventDefault();
  event.stopPropagation();
  onClose();
}

function useComposerFocus(
  ref: React.RefObject<HTMLElement | null>,
  roomLayout: StoreApi<RoomLayoutStore>,
): void {
  useLayoutEffect(() => {
    // It mounts 0 px tall (the board is measured right after): a plain focus would scroll the
    // room's box to reach the composer, leaving the board shifted up over a dark strip.
    const focusComposer = (): void =>
      ref.current?.querySelector<HTMLElement>('[role="combobox"]')?.focus({ preventScroll: true });
    focusComposer();
    return onChatFocusRequest(roomLayout, focusComposer);
  }, [ref, roomLayout]);
}

// The parent spans the board: it is what the 70% ceiling is measured against.
function useParentHeight(ref: React.RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    setHeight(parent.clientHeight);
    const observer = new ResizeObserver(() => setHeight(parent.clientHeight));
    observer.observe(parent);
    return () => observer.disconnect();
  }, [ref]);
  return height;
}

type ChatDrawerHandleProps = Readonly<{
  height: number;
  boardHeight: number;
  onChange: (height: number) => void;
}>;

const KEY_MOVES: Readonly<Record<string, (height: number) => number>> = {
  ArrowUp: (height) => height + CHAT_DRAWER_STEP,
  ArrowDown: (height) => height - CHAT_DRAWER_STEP,
};

function ChatDrawerHandle(props: ChatDrawerHandleProps): React.JSX.Element {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const move = KEY_MOVES[event.key];
    if (!move) return;
    event.preventDefault();
    props.onChange(move(props.height));
  };
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label="Altura do chat"
      aria-orientation="horizontal"
      aria-valuenow={props.height}
      aria-valuemin={CHAT_DRAWER_MIN_HEIGHT}
      aria-valuemax={clampChatDrawerHeight(Number.POSITIVE_INFINITY, props.boardHeight)}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => startDrag(event, props)}
      className="group absolute inset-x-0 top-0 flex h-3 -translate-y-1/2 cursor-row-resize touch-none items-center justify-center outline-none"
    >
      <span
        aria-hidden="true"
        className="h-1 w-12 rounded-full bg-divider transition-colors group-hover:bg-primary/60 group-focus-visible:bg-primary motion-reduce:transition-none"
      />
    </div>
  );
}

// Measured from where the drag started: the drawer's bottom stays put, its top follows.
function startDrag(event: PointerEvent<HTMLDivElement>, props: ChatDrawerHandleProps): void {
  const { clientY: startY } = event;
  const follow = (moved: DragPoint): void => props.onChange(props.height + startY - moved.clientY);
  if (trackPointerDrag(event.currentTarget, event, follow, () => undefined)) event.preventDefault();
}
