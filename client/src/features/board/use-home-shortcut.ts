import { useEffect, useRef } from 'react';
import { homeShortcutFor, type HomeShortcut } from '@/lib/board-shortcuts';

/** Runs `go` on the key of `shortcut` (Shift+M, Shift+F) anywhere on the page, a document on
 *  screen included; `null` leaves the key alone. A key held down goes once.
 *
 *  Example: `useHomeShortcut('main-map', hasHome ? openHome : null)` */
export function useHomeShortcut(shortcut: HomeShortcut, go: (() => void) | null): void {
  const latest = useRef(go);
  useEffect(() => {
    latest.current = go;
  });
  const enabled = go !== null;
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || homeShortcutFor(event) !== shortcut) return;
      event.preventDefault();
      latest.current?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcut, enabled]);
}
