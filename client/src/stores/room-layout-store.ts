import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { CHAT_DRAWER_DEFAULT_HEIGHT } from '@/lib/chat-drawer-height';
import { LIBRARY_DRAWER_DEFAULT_WIDTH } from '@/lib/library-drawer-width';
import {
  readStoredChoice,
  readStoredNumber,
  writeStoredChoice,
  type ChoiceStorage,
} from '@/lib/stored-choice';

export type RoomPanel = 'open' | 'closed';

export const ROOM_TABS = ['combat', 'people', 'dice'] as const;

export type RoomTab = (typeof ROOM_TABS)[number];

export type RoomChat = 'open' | 'closed';

export type RoomLayoutState = Readonly<{
  panel: RoomPanel;
  tab: RoomTab;
  focus: boolean;
  chat: RoomChat;
  chatHeight: number;
  /** How many times the composer was asked for (T); the docked chat opens and focuses on each. */
  chatFocusRequest: number;
  /** The library drawer width the user left it at (the drawer fits it to the room). */
  libraryWidth: number;
}>;

export type RoomLayoutStore = RoomLayoutState &
  Readonly<{
    togglePanel: () => void;
    showTab: (tab: RoomTab) => void;
    /** The rail's click: the tab already open collapses the panel; any other opens it there. */
    toggleTab: (tab: RoomTab) => void;
    toggleFocus: () => void;
    exitFocus: () => void;
    openChat: () => void;
    closeChat: () => void;
    toggleChat: () => void;
    setChatHeight: (height: number) => void;
    requestChatFocus: () => void;
    setLibraryWidth: (width: number) => void;
  }>;

export const ROOM_PANEL_STORAGE_KEY = 'lorkarium.roomPanel';

export const ROOM_CHAT_STORAGE_KEY = 'lorkarium.roomChat';

export const ROOM_CHAT_HEIGHT_STORAGE_KEY = 'lorkarium.roomChatHeight';

export const ROOM_LIBRARY_WIDTH_STORAGE_KEY = 'lorkarium.libraryWidth';

const OPEN_OR_CLOSED = ['open', 'closed'] as const;

type SetRoomLayout = StoreApi<RoomLayoutStore>['setState'];
type GetRoomLayout = StoreApi<RoomLayoutStore>['getState'];
type RoomPanelSlice = Omit<
  RoomLayoutStore,
  keyof RoomChatSlice | keyof ChatFocusSlice | keyof LibraryWidthSlice
>;
type RoomChatSlice = Pick<
  RoomLayoutStore,
  'chat' | 'chatHeight' | 'openChat' | 'closeChat' | 'toggleChat' | 'setChatHeight'
>;
type ChatFocusSlice = Pick<RoomLayoutStore, 'chatFocusRequest' | 'requestChatFocus'>;
type LibraryWidthSlice = Pick<RoomLayoutStore, 'libraryWidth' | 'setLibraryWidth'>;

/** How the play room is laid out around the board: the side panel and the chat bar (both
 *  remembered in the browser, with the chat drawer height and the library drawer width), the panel tab, focus mode (board
 *  only) and the requests for the chat composer. Tab, focus and requests reset per visit.
 *
 *  Example: `createRoomLayoutStore(window.localStorage).getState().showTab('people')` */
export function createRoomLayoutStore(storage: ChoiceStorage): StoreApi<RoomLayoutStore> {
  return createStore<RoomLayoutStore>()((set, get) => ({
    ...panelSliceOf(storage, set, get),
    ...chatSliceOf(storage, set, get),
    ...chatFocusSliceOf(set, get),
    ...libraryWidthSliceOf(storage, set),
  }));
}

function panelSliceOf(
  storage: ChoiceStorage,
  set: SetRoomLayout,
  get: GetRoomLayout,
): RoomPanelSlice {
  return {
    panel: readStoredChoice(storage, ROOM_PANEL_STORAGE_KEY, OPEN_OR_CLOSED, 'open'),
    tab: 'combat',
    focus: false,
    togglePanel: () => {
      const panel: RoomPanel = get().panel === 'open' ? 'closed' : 'open';
      set({ panel });
      writeStoredChoice(storage, ROOM_PANEL_STORAGE_KEY, panel);
    },
    showTab: (tab) => {
      set({ tab, panel: 'open' });
      writeStoredChoice(storage, ROOM_PANEL_STORAGE_KEY, 'open');
    },
    toggleTab: (tab) => {
      const { panel, tab: shown, togglePanel, showTab } = get();
      if (panel === 'open' && shown === tab) return togglePanel();
      showTab(tab);
    },
    toggleFocus: () => set({ focus: !get().focus }),
    exitFocus: () => set({ focus: false }),
  };
}

function chatSliceOf(
  storage: ChoiceStorage,
  set: SetRoomLayout,
  get: GetRoomLayout,
): RoomChatSlice {
  const showChat = (chat: RoomChat): void => {
    set({ chat });
    writeStoredChoice(storage, ROOM_CHAT_STORAGE_KEY, chat);
  };
  return {
    chat: readStoredChoice(storage, ROOM_CHAT_STORAGE_KEY, OPEN_OR_CLOSED, 'closed'),
    chatHeight: readStoredNumber(
      storage,
      ROOM_CHAT_HEIGHT_STORAGE_KEY,
      isPositiveSize,
      CHAT_DRAWER_DEFAULT_HEIGHT,
    ),
    openChat: () => showChat('open'),
    closeChat: () => showChat('closed'),
    toggleChat: () => showChat(get().chat === 'open' ? 'closed' : 'open'),
    setChatHeight: (height) => rememberChatHeight(storage, set, height),
  };
}

// Only counted: whether the chat can open here (docked, beside the board) is the dock's call.
function chatFocusSliceOf(set: SetRoomLayout, get: GetRoomLayout): ChatFocusSlice {
  return {
    chatFocusRequest: 0,
    requestChatFocus: () => set({ chatFocusRequest: get().chatFocusRequest + 1 }),
  };
}

// The height comes from a drag, so it is rounded; a value no drawer can have is dropped rather
// than stored, so the next visit never starts from it.
function rememberChatHeight(storage: ChoiceStorage, set: SetRoomLayout, height: number): void {
  const chatHeight = Math.round(height);
  if (!isPositiveSize(chatHeight)) return;
  set({ chatHeight });
  writeStoredChoice(storage, ROOM_CHAT_HEIGHT_STORAGE_KEY, String(chatHeight));
}

function isPositiveSize(height: number): boolean {
  return Number.isInteger(height) && height > 0;
}

// Stored as dragged; how much of it fits is measured against the room each time it is drawn.
function libraryWidthSliceOf(storage: ChoiceStorage, set: SetRoomLayout): LibraryWidthSlice {
  return {
    libraryWidth: readStoredNumber(
      storage,
      ROOM_LIBRARY_WIDTH_STORAGE_KEY,
      isPositiveSize,
      LIBRARY_DRAWER_DEFAULT_WIDTH,
    ),
    setLibraryWidth: (width) => {
      const libraryWidth = Math.round(width);
      if (!isPositiveSize(libraryWidth)) return;
      set({ libraryWidth });
      writeStoredChoice(storage, ROOM_LIBRARY_WIDTH_STORAGE_KEY, String(libraryWidth));
    },
  };
}

/** Calls `onRequest` on each `requestChatFocus` (T) and on nothing else, until the returned
 *  function is called.
 *
 *  Example: `useEffect(() => onChatFocusRequest(roomLayout, focusComposer), [roomLayout])` */
export function onChatFocusRequest(
  store: StoreApi<RoomLayoutStore>,
  onRequest: () => void,
): () => void {
  return store.subscribe((state, last) => {
    if (state.chatFocusRequest !== last.chatFocusRequest) onRequest();
  });
}

/** React view of one slice of the room layout (re-renders when it changes).
 *
 *  Example: `const focus = useRoomLayout(store, (state) => state.focus)` */
export function useRoomLayout<T>(
  store: StoreApi<RoomLayoutStore>,
  selector: (state: RoomLayoutStore) => T,
): T {
  return useStore(store, selector);
}

/** Whether a tab value from the UI (a plain string) is one of the room tabs.
 *
 *  Example: `if (isRoomTab(value)) store.getState().showTab(value)` */
export function isRoomTab(value: string): value is RoomTab {
  return ROOM_TABS.some((tab) => tab === value);
}
