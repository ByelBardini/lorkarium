import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { CHAT_DRAWER_DEFAULT_HEIGHT } from '@/lib/chat-drawer-height';
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
}>;

export type RoomLayoutStore = RoomLayoutState &
  Readonly<{
    togglePanel: () => void;
    showTab: (tab: RoomTab) => void;
    toggleFocus: () => void;
    exitFocus: () => void;
    openChat: () => void;
    closeChat: () => void;
    toggleChat: () => void;
    setChatHeight: (height: number) => void;
  }>;

export const ROOM_PANEL_STORAGE_KEY = 'lorkarium.roomPanel';

export const ROOM_CHAT_STORAGE_KEY = 'lorkarium.roomChat';

export const ROOM_CHAT_HEIGHT_STORAGE_KEY = 'lorkarium.roomChatHeight';

const OPEN_OR_CLOSED = ['open', 'closed'] as const;

type SetRoomLayout = StoreApi<RoomLayoutStore>['setState'];
type GetRoomLayout = StoreApi<RoomLayoutStore>['getState'];
type RoomPanelSlice = Omit<RoomLayoutStore, keyof RoomChatSlice>;
type RoomChatSlice = Pick<
  RoomLayoutStore,
  'chat' | 'chatHeight' | 'openChat' | 'closeChat' | 'toggleChat' | 'setChatHeight'
>;

/** How the play room is laid out around the board: the side panel and the chat bar (both
 *  remembered in the browser, with the chat drawer height), the panel tab and focus mode (board
 *  only). Tab and focus reset per visit.
 *
 *  Example: `createRoomLayoutStore(window.localStorage).getState().showTab('people')` */
export function createRoomLayoutStore(storage: ChoiceStorage): StoreApi<RoomLayoutStore> {
  return createStore<RoomLayoutStore>()((set, get) => ({
    ...panelSliceOf(storage, set, get),
    ...chatSliceOf(storage, set, get),
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
      isChatHeight,
      CHAT_DRAWER_DEFAULT_HEIGHT,
    ),
    openChat: () => showChat('open'),
    closeChat: () => showChat('closed'),
    toggleChat: () => showChat(get().chat === 'open' ? 'closed' : 'open'),
    setChatHeight: (height) => rememberChatHeight(storage, set, height),
  };
}

// The height comes from a drag, so it is rounded; a value no drawer can have is dropped rather
// than stored, so the next visit never starts from it.
function rememberChatHeight(storage: ChoiceStorage, set: SetRoomLayout, height: number): void {
  const chatHeight = Math.round(height);
  if (!isChatHeight(chatHeight)) return;
  set({ chatHeight });
  writeStoredChoice(storage, ROOM_CHAT_HEIGHT_STORAGE_KEY, String(chatHeight));
}

function isChatHeight(height: number): boolean {
  return Number.isInteger(height) && height > 0;
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
