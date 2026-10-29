import { describe, expect, it } from 'vitest';
import {
  BrowserChatWindowHost,
  CHAT_WINDOW_FEATURES,
  CHAT_WINDOW_URL,
} from '@/services/chat-window-host';
import { ChatWindowFake } from '../support/chat-window-host-fake';

/** The main window's `open`: records each call and answers the window it was given. */
class WindowOpenerFake {
  readonly calls: unknown[][] = [];

  constructor(private readonly answer: Window | null) {}

  open = (...args: unknown[]): Window | null => {
    this.calls.push(args);
    return this.answer;
  };
}

describe('BrowserChatWindowHost', () => {
  it('passes url, name and features to window.open and hands back the window', () => {
    const opened = new ChatWindowFake() as unknown as Window;
    const opener = new WindowOpenerFake(opened);

    const handle = new BrowserChatWindowHost(opener).open(
      CHAT_WINDOW_URL,
      'lorkarium-chat-x',
      CHAT_WINDOW_FEATURES,
    );

    expect(opener.calls).toEqual([[CHAT_WINDOW_URL, 'lorkarium-chat-x', CHAT_WINDOW_FEATURES]]);
    expect(handle).toBe(opened);
  });

  it('a popup the browser blocks comes back as null', () => {
    const host = new BrowserChatWindowHost(new WindowOpenerFake(null));

    expect(host.open(CHAT_WINDOW_URL, 'lorkarium-chat-x', CHAT_WINDOW_FEATURES)).toBeNull();
  });
});
