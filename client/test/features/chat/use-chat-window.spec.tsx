import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_WINDOW_POLL_MS, useChatWindow } from '@/features/chat/use-chat-window';
import { CHAT_WINDOW_FEATURES, CHAT_WINDOW_URL } from '@/services/chat-window-host';
import { ChatWindowHostFake } from '../../support/chat-window-host-fake';

const CAMPAIGN_ID = '0b9e7b54-3f0a-4c6e-9d51-6d2f4b0a1c11';

function renderChatWindow(host: ChatWindowHostFake) {
  return renderHook(() => useChatWindow(CAMPAIGN_ID, host));
}

function tick(): void {
  act(() => vi.advanceTimersByTime(CHAT_WINDOW_POLL_MS));
}

class AlwaysOnTopFake {
  readonly calls: boolean[] = [];
  problem: Error | null = null;

  readonly set = async (enabled: boolean): Promise<void> => {
    this.calls.push(enabled);
    if (this.problem) throw this.problem;
  };
}

describe('useChatWindow', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts docked, with nothing to portal into', () => {
    const { result } = renderChatWindow(new ChatWindowHostFake());

    expect(result.current.status).toBe('docked');
    expect(result.current.portalTarget).toBeNull();
  });

  it('a native chat can enable and disable always on top through its own window handle', async () => {
    const host = new ChatWindowHostFake();
    const { result } = renderChatWindow(host);
    act(() => result.current.open());
    const topmost = new AlwaysOnTopFake();
    host.last().setAlwaysOnTop = topmost.set;
    host.last().load();
    tick();
    expect(result.current.canAlwaysOnTop).toBe(true);
    await act(() => result.current.setAlwaysOnTop(true));
    expect(result.current.alwaysOnTop).toBe(true);
    await act(() => result.current.setAlwaysOnTop(false));
    expect(result.current.alwaysOnTop).toBe(false);
    expect(topmost.calls).toEqual([true, false]);
  });

  it('a regular browser popup exposes always on top as unavailable', () => {
    const host = new ChatWindowHostFake();
    const { result } = renderChatWindow(host);
    act(() => result.current.open());
    host.last().load();
    tick();
    expect(result.current.canAlwaysOnTop).toBe(false);
    expect(result.current.alwaysOnTop).toBe(false);
  });

  it('a refused native topmost change keeps the checkbox off and gives a readable error', async () => {
    const host = new ChatWindowHostFake();
    const { result } = renderChatWindow(host);
    act(() => result.current.open());
    const topmost = new AlwaysOnTopFake();
    topmost.problem = new Error('native refused');
    host.last().setAlwaysOnTop = topmost.set;
    host.last().load();
    tick();
    expect(result.current.canAlwaysOnTop).toBe(true);
    await act(() => result.current.setAlwaysOnTop(true));
    expect(result.current.alwaysOnTop).toBe(false);
    expect(result.current.alwaysOnTopProblem).toBe(
      'Não foi possível alterar “Sempre por cima”. Tente novamente.',
    );
    expect(result.current.changingAlwaysOnTop).toBe(false);
  });

  it('opening asks for the chat page as a popup named after the table', () => {
    const host = new ChatWindowHostFake();
    const { result } = renderChatWindow(host);

    act(() => result.current.open());

    expect(host.calls).toEqual([
      {
        url: CHAT_WINDOW_URL,
        name: `lorkarium-chat-${CAMPAIGN_ID}`,
        features: CHAT_WINDOW_FEATURES,
      },
    ]);
    expect(CHAT_WINDOW_FEATURES).toBe('popup,width=420,height=720');
  });

  it('an opened window is detached but gives no target before the chat page loads', () => {
    const host = new ChatWindowHostFake();
    const { result } = renderChatWindow(host);

    act(() => result.current.open());
    tick();

    expect(result.current.status).toBe('detached');
    expect(result.current.portalTarget).toBeNull();
  });

  it('once the chat page loads, the target is that window body', () => {
    const host = new ChatWindowHostFake();
    const { result } = renderChatWindow(host);

    act(() => result.current.open());
    host.last().load();
    tick();

    expect(result.current.status).toBe('detached');
    expect(result.current.portalTarget).toBe(host.last().document.body);
  });

  it('a blocked popup (null) warns and keeps the chat docked in the tab', () => {
    const { result } = renderChatWindow(new ChatWindowHostFake(true));

    act(() => result.current.open());
    tick();

    expect(result.current.status).toBe('blocked');
    expect(result.current.portalTarget).toBeNull();
  });

  it('closing the window by its X brings the chat back to the tab', () => {
    const host = new ChatWindowHostFake();
    const { result } = renderChatWindow(host);
    act(() => result.current.open());
    host.last().load();
    tick();

    host.last().closeByUser();
    tick();

    expect(result.current.status).toBe('docked');
    expect(result.current.portalTarget).toBeNull();
  });

  it('"Trazer de volta" closes the window and docks the chat at once', () => {
    const host = new ChatWindowHostFake();
    const { result } = renderChatWindow(host);
    act(() => result.current.open());
    host.last().load();
    tick();

    act(() => result.current.bringBack());

    expect(host.last().closed).toBe(true);
    expect(result.current.status).toBe('docked');
    expect(result.current.portalTarget).toBeNull();
  });

  it('leaving the room (unmount) closes the window', () => {
    const host = new ChatWindowHostFake();
    const { result, unmount } = renderChatWindow(host);
    act(() => result.current.open());

    unmount();

    expect(host.last().closes).toBe(1);
  });

  it('reloading or leaving the page (pagehide) closes the window', () => {
    const host = new ChatWindowHostFake();
    const { result } = renderChatWindow(host);
    act(() => result.current.open());

    window.dispatchEvent(new Event('pagehide'));

    expect(host.last().closed).toBe(true);
  });

  it('opening again with the window still open only focuses it', () => {
    const host = new ChatWindowHostFake();
    const { result } = renderChatWindow(host);
    act(() => result.current.open());

    act(() => result.current.open());

    expect(host.calls).toHaveLength(1);
    expect(host.last().focuses).toBe(1);
  });

  it('opening after the person closed the window asks for a new one', () => {
    const host = new ChatWindowHostFake();
    const { result } = renderChatWindow(host);
    act(() => result.current.open());
    host.last().closeByUser();
    tick();

    act(() => result.current.open());

    expect(host.calls).toHaveLength(2);
    expect(result.current.status).toBe('detached');
  });

  it('a chat page reloaded in the window becomes the new target', () => {
    const host = new ChatWindowHostFake();
    const { result } = renderChatWindow(host);
    act(() => result.current.open());
    const chatWindow = host.last();
    chatWindow.load();
    tick();

    const reloadedBody = chatWindow.document.createElement('body');
    chatWindow.document.documentElement.replaceChild(reloadedBody, chatWindow.document.body);
    chatWindow.load();
    tick();

    expect(result.current.portalTarget).toBe(reloadedBody);
  });
});
