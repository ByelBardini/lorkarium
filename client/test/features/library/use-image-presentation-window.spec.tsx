import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  imageWindowSupported,
  useImagePresentationWindow,
} from '@/features/library/use-image-presentation-window';
import { ChatWindowHostFake } from '../../support/chat-window-host-fake';

describe('image presentation native window', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('browser, old shell and missing support mark choose the modal without opening a popup', () => {
    const host = new ChatWindowHostFake();
    const hook = renderHook(() =>
      useImagePresentationWindow('mesa', host, 'P1', imageWindowSupported(true), () => undefined),
    );
    expect(imageWindowSupported(false)).toBe(false);
    expect(hook.result.current.native).toBe(false);
    expect(host.calls).toEqual([]);
  });

  it('only a desktop with the explicit support marker opts into automatic windows', () => {
    Object.defineProperty(window, '__LORKARIUM_IMAGE_WINDOW_SUPPORTED__', {
      configurable: true,
      value: true,
    });
    expect(imageWindowSupported(true)).toBe(true);
    expect(imageWindowSupported(false)).toBe(false);
    Reflect.deleteProperty(window, '__LORKARIUM_IMAGE_WINDOW_SUPPORTED__');
  });

  it('a window whose document never loads falls back to a modal', () => {
    const host = new ChatWindowHostFake();
    const hook = renderHook(() =>
      useImagePresentationWindow('mesa', host, 'P1', true, () => undefined),
    );
    act(() => vi.advanceTimersByTime(5000));
    expect(hook.result.current.native).toBe(false);
    expect(hook.result.current.popup.status).toBe('blocked');
    expect(host.last().closed).toBe(true);
  });

  it('refused native close keeps the presentation mounted and exposes a recoverable error', async () => {
    const host = new ChatWindowHostFake();
    const hook = renderHook(() =>
      useImagePresentationWindow('mesa', host, 'P1', true, () => undefined),
    );
    host.last().load();
    act(() => vi.advanceTimersByTime(250));
    host.last().close = () => Promise.reject(new Error('native close refused'));
    await act(async () => hook.result.current.popup.bringBack());
    expect(hook.result.current.native).toBe(true);
    expect(hook.result.current.closeError).toBe('native close refused');
    expect(hook.result.current.popup.portalTarget).toBe(host.last().document.body);
  });

  it('marked desktop opens one image panel and replaces its contents without opening another', () => {
    const host = new ChatWindowHostFake();
    const hook = renderHook(
      ({ id }) => useImagePresentationWindow('mesa', host, id, true, () => undefined),
      { initialProps: { id: 'P1' } },
    );
    expect(host.calls).toEqual([
      {
        url: '/chat-window.html?panel=image',
        name: 'lorkarium-image-mesa',
        features: 'popup,width=960,height=720',
      },
    ]);
    host.last().load();
    act(() => vi.advanceTimersByTime(250));
    expect(hook.result.current.popup.portalTarget).toBe(host.last().document.body);
    hook.rerender({ id: 'P2' });
    expect(host.calls).toHaveLength(1);
    expect(hook.result.current.native).toBe(true);
  });

  it('native X dismisses P1 locally and only P2 opens another window', () => {
    const host = new ChatWindowHostFake();
    const dismissed: string[] = [];
    const hook = renderHook(
      ({ id }) => useImagePresentationWindow('mesa', host, id, true, () => dismissed.push(id)),
      { initialProps: { id: 'P1' } },
    );
    host.last().closeByUser();
    act(() => vi.advanceTimersByTime(250));
    expect(dismissed).toEqual(['P1']);
    expect(host.calls).toHaveLength(1);
    hook.rerender({ id: 'P2' });
    expect(host.calls).toHaveLength(2);
  });

  it('host refusing the native window falls back to a modal', () => {
    const host = new ChatWindowHostFake(true);
    const hook = renderHook(() =>
      useImagePresentationWindow('mesa', host, 'P1', true, () => undefined),
    );
    expect(hook.result.current.native).toBe(false);
    expect(hook.result.current.popup.status).toBe('blocked');
    expect(host.calls).toHaveLength(1);
  });

  it('leaving the room closes the auxiliary window', () => {
    const host = new ChatWindowHostFake();
    const hook = renderHook(() =>
      useImagePresentationWindow('mesa', host, 'P1', true, () => undefined),
    );
    const popup = host.last();
    hook.unmount();
    expect(popup.closed).toBe(true);
  });
});
