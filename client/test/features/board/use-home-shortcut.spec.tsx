import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useHomeShortcut } from '@/features/board/use-home-shortcut';

function pressShift(key: string, init: KeyboardEventInit = {}): boolean {
  return fireEvent.keyDown(document.body, { key, shiftKey: true, ...init });
}

describe('useHomeShortcut', () => {
  it('runs on its key and keeps the key from the page', () => {
    const go = vi.fn();
    renderHook(() => useHomeShortcut('main-sheet', go));
    const notPrevented = pressShift('F');
    expect(go).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(false);
  });

  it("leaves the other home's key and the plain letter alone", () => {
    const go = vi.fn();
    renderHook(() => useHomeShortcut('main-map', go));
    pressShift('F');
    fireEvent.keyDown(document.body, { key: 'm' });
    expect(go).not.toHaveBeenCalled();
  });

  it('a key held down goes once', () => {
    const go = vi.fn();
    renderHook(() => useHomeShortcut('main-map', go));
    pressShift('M');
    pressShift('M', { repeat: true });
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('with nothing to go to, the key is left alone', () => {
    renderHook(() => useHomeShortcut('main-map', null));
    expect(pressShift('M')).toBe(true);
  });

  it('runs the latest action, and stops once unmounted', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(({ go }) => useHomeShortcut('main-map', go), {
      initialProps: { go: first },
    });
    rerender({ go: second });
    pressShift('M');
    unmount();
    pressShift('M');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
