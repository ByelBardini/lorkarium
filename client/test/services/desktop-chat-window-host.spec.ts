import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CHAT_WINDOW_FEATURES, CHAT_WINDOW_URL } from '@/services/chat-window-host';
import { TauriChatWindowHost } from '@/services/desktop-chat-window-host';
import { ChatWindowFake } from '../support/chat-window-host-fake';

class NativeOpenerFake {
  readonly calls: unknown[][] = [];
  constructor(private readonly answer: ChatWindowFake | null) {}

  open(...args: unknown[]): Window | null {
    this.calls.push(args);
    return this.answer as unknown as Window | null;
  }
}

describe('TauriChatWindowHost', () => {
  const calls: { command: string; args: unknown }[] = [];

  beforeEach(() => {
    calls.length = 0;
    mockIPC((command, args) => {
      calls.push({ command, args });
    });
  });
  afterEach(() => clearMocks());

  function openNative(label: string | undefined = 'chat-7') {
    const popup = new ChatWindowFake();
    Object.defineProperty(popup.document.defaultView, '__LORKARIUM_CHAT_WINDOW_LABEL__', {
      value: label,
    });
    const opener = new NativeOpenerFake(popup);
    const handle = new TauriChatWindowHost(opener).open(
      CHAT_WINDOW_URL,
      'lorkarium-chat-x',
      CHAT_WINDOW_FEATURES,
    );
    if (!handle) throw new Error('expected a native chat handle');
    return { popup, opener, handle };
  }

  it('pins and unpins only the label provided by the native chat window', async () => {
    const { handle } = openNative();

    await handle.setAlwaysOnTop?.(true);
    await handle.setAlwaysOnTop?.(false);

    expect(calls).toEqual([
      { command: 'set_chat_always_on_top', args: { label: 'chat-7', enabled: true } },
      { command: 'set_chat_always_on_top', args: { label: 'chat-7', enabled: false } },
    ]);
  });

  it('keeps opening, focusing and closing the same browser window', () => {
    const { popup, opener, handle } = openNative();
    expect(opener.calls).toEqual([[CHAT_WINDOW_URL, 'lorkarium-chat-x', CHAT_WINDOW_FEATURES]]);
    expect(handle.document).toBe(popup.document);
    handle.focus();
    handle.close();
    expect(popup.focuses).toBe(1);
    expect(handle.closed).toBe(true);
  });

  it('a blocked native popup still returns null', () => {
    expect(
      new TauriChatWindowHost(new NativeOpenerFake(null)).open(
        CHAT_WINDOW_URL,
        'chat',
        CHAT_WINDOW_FEATURES,
      ),
    ).toBeNull();
  });

  it('an arbitrary window label cannot reach IPC', async () => {
    const { handle } = openNative('main');
    await expect(handle.setAlwaysOnTop?.(true)).rejects.toThrow('expected chat-<number>');
    expect(calls).toEqual([]);
  });

  it('a missing native marker cannot reach IPC', async () => {
    const handle = new TauriChatWindowHost(new NativeOpenerFake(new ChatWindowFake())).open(
      CHAT_WINDOW_URL,
      'chat',
      CHAT_WINDOW_FEATURES,
    );
    if (!handle) throw new Error('expected a native chat handle');
    await expect(handle.setAlwaysOnTop?.(true)).rejects.toThrow('expected chat-<number>');
    expect(calls).toEqual([]);
  });

  it('a closed popup cannot be pinned', async () => {
    const { popup, handle } = openNative();
    popup.closeByUser();
    await expect(handle.setAlwaysOnTop?.(true)).rejects.toThrow('closed chat window');
    expect(calls).toEqual([]);
  });

  it('an IPC refusal reaches the caller so the checkbox can remain unchanged', async () => {
    mockIPC(() => {
      throw new Error('native pin refused');
    });
    const { handle } = openNative();
    await expect(handle.setAlwaysOnTop?.(true)).rejects.toThrow('native pin refused');
  });
});
