import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  CHAT_SOUND_STORAGE_KEY,
  createChatPreferencesStore,
  useChatPreferences,
} from '@/stores/chat-preferences-store';
import { StorageFake } from '../support/storage-fake';

describe('createChatPreferencesStore', () => {
  it('with nothing stored the chat sound is on', () => {
    expect(createChatPreferencesStore(new StorageFake()).getState().sound).toBe(true);
  });

  it('muting is remembered under lorkarium.chatSound as off', () => {
    const storage = new StorageFake();
    createChatPreferencesStore(storage).getState().setSound(false);

    expect(CHAT_SOUND_STORAGE_KEY).toBe('lorkarium.chatSound');
    expect(storage.values.get('lorkarium.chatSound')).toBe('off');
    expect(createChatPreferencesStore(storage).getState().sound).toBe(false);
  });

  it('turning it on again is remembered on', () => {
    const storage = new StorageFake();
    storage.values.set('lorkarium.chatSound', 'off');
    const store = createChatPreferencesStore(storage);

    store.getState().setSound(true);

    expect(store.getState().sound).toBe(true);
    expect(storage.values.get('lorkarium.chatSound')).toBe('on');
  });

  it('an unknown stored value leaves it on', () => {
    const storage = new StorageFake();
    storage.values.set('lorkarium.chatSound', 'loud');
    expect(createChatPreferencesStore(storage).getState().sound).toBe(true);
  });

  it('the dice muted on this device leave the chat sound on', () => {
    const storage = new StorageFake();
    storage.values.set('lorkarium.diceSound', 'off');
    expect(createChatPreferencesStore(storage).getState().sound).toBe(true);
  });

  it('a storage that throws starts on, and muting still works in memory', () => {
    const store = createChatPreferencesStore(new StorageFake(true));
    expect(store.getState().sound).toBe(true);

    store.getState().setSound(false);

    expect(store.getState().sound).toBe(false);
  });
});

describe('useChatPreferences', () => {
  it('the React view follows a mute', () => {
    const store = createChatPreferencesStore(new StorageFake());
    const { result } = renderHook(() => useChatPreferences(store, (state) => state.sound));

    act(() => store.getState().setSound(false));

    expect(result.current).toBe(false);
  });
});
