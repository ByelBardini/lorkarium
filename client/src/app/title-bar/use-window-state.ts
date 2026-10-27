import { useEffect, useState } from 'react';
import type { DesktopWindow } from '@/services/desktop-window';

/** Whether the window is maximized, kept by the shell's resize events.
 *
 *  Example: `const maximized = useWindowMaximized(desktopWindow)` */
export function useWindowMaximized(desktopWindow: DesktopWindow): boolean {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => followMaximized(desktopWindow, setMaximized), [desktopWindow]);
  return maximized;
}

function followMaximized(
  desktopWindow: DesktopWindow,
  update: (maximized: boolean) => void,
): () => void {
  let active = true;
  let resized = false;
  // A resize that lands before the first answer is newer than it.
  void desktopWindow.isMaximized().then((value) => {
    if (active && !resized) update(value);
  }, ignoreRefusal);
  const subscription = desktopWindow
    .onMaximizedChange((value) => {
      resized = true;
      if (active) update(value);
    })
    .catch(() => null);
  return () => {
    active = false;
    void subscription.then((unsubscribe) => unsubscribe?.());
  };
}

/** Whether the window has the focus; the bar dims without it, like the native one.
 *
 *  Example: `const focused = useWindowFocused()` */
export function useWindowFocused(): boolean {
  const [focused, setFocused] = useState(() => document.hasFocus());
  useEffect(() => {
    const onFocus = (): void => setFocused(true);
    const onBlur = (): void => setFocused(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
  return focused;
}

// An older shell, or one that refused: the native shortcuts (Win+arrows, Alt+F4) still work.
export function ignoreRefusal(): void {}
