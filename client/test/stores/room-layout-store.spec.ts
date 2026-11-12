import { describe, expect, it } from 'vitest';
import {
  ROOM_CHAT_HEIGHT_STORAGE_KEY,
  ROOM_CHAT_STORAGE_KEY,
  ROOM_PANEL_STORAGE_KEY,
  createRoomLayoutStore,
  isRoomTab,
  onChatFocusRequest,
} from '@/stores/room-layout-store';
import { StorageFake } from '../support/storage-fake';

describe('room layout store', () => {
  it('starts with the panel open on the combat tab and focus mode off', () => {
    const state = createRoomLayoutStore(new StorageFake()).getState();
    expect(state).toMatchObject({ panel: 'open', tab: 'combat', focus: false });
  });

  it('togglePanel closes the panel and remembers it as closed', () => {
    const storage = new StorageFake();
    const store = createRoomLayoutStore(storage);
    store.getState().togglePanel();
    expect(store.getState().panel).toBe('closed');
    expect(storage.values.get(ROOM_PANEL_STORAGE_KEY)).toBe('closed');
  });

  it('a panel remembered as closed starts closed', () => {
    const storage = new StorageFake();
    storage.values.set(ROOM_PANEL_STORAGE_KEY, 'closed');
    expect(createRoomLayoutStore(storage).getState().panel).toBe('closed');
  });

  it('an invalid remembered panel starts open', () => {
    const storage = new StorageFake();
    storage.values.set(ROOM_PANEL_STORAGE_KEY, 'half');
    expect(createRoomLayoutStore(storage).getState().panel).toBe('open');
  });

  it('showTab("people") opens a closed panel on that tab, and the tab is not stored', () => {
    const storage = new StorageFake();
    const store = createRoomLayoutStore(storage);
    store.getState().togglePanel();
    store.getState().showTab('people');
    expect(store.getState()).toMatchObject({ panel: 'open', tab: 'people' });
    expect([...storage.values.keys()]).toEqual([ROOM_PANEL_STORAGE_KEY]);
  });

  it('toggleFocus turns focus mode on and off, and exitFocus only turns it off', () => {
    const store = createRoomLayoutStore(new StorageFake());
    store.getState().toggleFocus();
    expect(store.getState().focus).toBe(true);
    store.getState().toggleFocus();
    expect(store.getState().focus).toBe(false);
    store.getState().exitFocus();
    expect(store.getState().focus).toBe(false);
    store.getState().toggleFocus();
    store.getState().exitFocus();
    expect(store.getState().focus).toBe(false);
  });

  it('focus mode is never stored', () => {
    const storage = new StorageFake();
    createRoomLayoutStore(storage).getState().toggleFocus();
    expect(storage.values.size).toBe(0);
  });

  it('a storage that throws keeps the panel in memory without breaking', () => {
    const store = createRoomLayoutStore(new StorageFake(true));
    store.getState().togglePanel();
    expect(store.getState().panel).toBe('closed');
  });

  describe('chat bar', () => {
    it('starts closed at the default drawer height when nothing is stored', () => {
      const state = createRoomLayoutStore(new StorageFake()).getState();
      expect(state).toMatchObject({ chat: 'closed', chatHeight: 440 });
    });

    it('openChat opens the drawer and remembers it as open', () => {
      const storage = new StorageFake();
      const store = createRoomLayoutStore(storage);
      store.getState().openChat();
      expect(store.getState().chat).toBe('open');
      expect(storage.values.get(ROOM_CHAT_STORAGE_KEY)).toBe('open');
    });

    it('closeChat closes an open drawer and remembers it as closed', () => {
      const storage = new StorageFake();
      const store = createRoomLayoutStore(storage);
      store.getState().openChat();
      store.getState().closeChat();
      expect(store.getState().chat).toBe('closed');
      expect(storage.values.get(ROOM_CHAT_STORAGE_KEY)).toBe('closed');
    });

    it('toggleChat opens a closed drawer and closes it again', () => {
      const storage = new StorageFake();
      const store = createRoomLayoutStore(storage);
      store.getState().toggleChat();
      expect(store.getState().chat).toBe('open');
      store.getState().toggleChat();
      expect(store.getState().chat).toBe('closed');
      expect(storage.values.get(ROOM_CHAT_STORAGE_KEY)).toBe('closed');
    });

    it('setChatHeight(320) keeps and remembers the drawer height', () => {
      const storage = new StorageFake();
      const store = createRoomLayoutStore(storage);
      store.getState().setChatHeight(320);
      expect(store.getState().chatHeight).toBe(320);
      expect(storage.values.get(ROOM_CHAT_HEIGHT_STORAGE_KEY)).toBe('320');
    });

    it('a fractional height from a drag is rounded to a whole pixel', () => {
      const storage = new StorageFake();
      const store = createRoomLayoutStore(storage);
      store.getState().setChatHeight(287.6);
      expect(store.getState().chatHeight).toBe(288);
      expect(storage.values.get(ROOM_CHAT_HEIGHT_STORAGE_KEY)).toBe('288');
    });

    it.each([0, -40, Number.NaN, Number.POSITIVE_INFINITY])(
      'setChatHeight(%s) is ignored: the height and the storage stay as they were',
      (height) => {
        const storage = new StorageFake();
        const store = createRoomLayoutStore(storage);
        store.getState().setChatHeight(height);
        expect(store.getState().chatHeight).toBe(440);
        expect(storage.values.has(ROOM_CHAT_HEIGHT_STORAGE_KEY)).toBe(false);
      },
    );

    it('a new store over the same storage starts open at the remembered height', () => {
      const storage = new StorageFake();
      const first = createRoomLayoutStore(storage);
      first.getState().openChat();
      first.getState().setChatHeight(320);
      const state = createRoomLayoutStore(storage).getState();
      expect(state).toMatchObject({ chat: 'open', chatHeight: 320 });
    });

    it.each(['abc', '-5', '0', '320.5'])(
      'a remembered height of "%s" starts at the default',
      (text) => {
        const storage = new StorageFake();
        storage.values.set(ROOM_CHAT_HEIGHT_STORAGE_KEY, text);
        expect(createRoomLayoutStore(storage).getState().chatHeight).toBe(440);
      },
    );

    it('an invalid remembered chat state starts closed', () => {
      const storage = new StorageFake();
      storage.values.set(ROOM_CHAT_STORAGE_KEY, 'half');
      expect(createRoomLayoutStore(storage).getState().chat).toBe('closed');
    });

    it('a storage that throws keeps the chat state and height in memory', () => {
      const store = createRoomLayoutStore(new StorageFake(true));
      store.getState().openChat();
      store.getState().setChatHeight(400);
      expect(store.getState()).toMatchObject({ chat: 'open', chatHeight: 400 });
    });

    it('opening the chat leaves the side panel and its stored choice alone', () => {
      const storage = new StorageFake();
      const store = createRoomLayoutStore(storage);
      store.getState().togglePanel();
      store.getState().openChat();
      expect(store.getState().panel).toBe('closed');
      expect(storage.values.get(ROOM_PANEL_STORAGE_KEY)).toBe('closed');
    });

    it('requestChatFocus counts each request from 0, without opening the drawer or storing it', () => {
      const storage = new StorageFake();
      const store = createRoomLayoutStore(storage);
      expect(store.getState().chatFocusRequest).toBe(0);
      store.getState().requestChatFocus();
      store.getState().requestChatFocus();
      expect(store.getState()).toMatchObject({ chatFocusRequest: 2, chat: 'closed' });
      expect([...storage.values.keys()]).toEqual([]);
    });

    it('onChatFocusRequest hears each request but no other change, until it is stopped', () => {
      const store = createRoomLayoutStore(new StorageFake());
      let heard = 0;
      const stop = onChatFocusRequest(store, () => void (heard += 1));
      store.getState().openChat();
      store.getState().toggleFocus();
      store.getState().requestChatFocus();
      store.getState().requestChatFocus();
      stop();
      store.getState().requestChatFocus();
      expect(heard).toBe(2);
    });
  });

  it.each([
    ['combat', true],
    ['people', true],
    ['dice', true],
    ['chat', false],
    ['notes', false],
  ])('isRoomTab(%s) is %s', (value, expected) => {
    expect(isRoomTab(value)).toBe(expected);
  });
});
