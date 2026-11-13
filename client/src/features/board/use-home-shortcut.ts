import { useEffect, useRef } from 'react';
import { homeShortcutFor, type HomeShortcut } from '@/lib/board-shortcuts';
import { showPreviousRoomTab, type RoomTabsDeps } from './use-tab-shortcuts';

/** The home already on screen: its key goes back to the tab shown before it. */
export type HomeReturn = Readonly<{ shown: boolean; room: RoomTabsDeps }>;

/** Runs `go` on the key of `shortcut` (Shift+M, Shift+F) anywhere on the page, a document on
 *  screen included; `null` leaves the key alone. A key held down goes once. With `back` and the
 *  home already shown, the key goes back to the tab before it (none left open: it stays).
 *
 *  Example: `useHomeShortcut('main-map', hasHome ? openHome : null, { shown: homeShown, room })` */
export function useHomeShortcut(
  shortcut: HomeShortcut,
  go: (() => void) | null,
  back: HomeReturn | null = null,
): void {
  const latest = useRef(go);
  const latestBack = useRef(back);
  useEffect(() => {
    latest.current = go;
    latestBack.current = back;
  });
  const enabled = go !== null;
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || homeShortcutFor(event) !== shortcut) return;
      event.preventDefault();
      const home = latestBack.current;
      if (home?.shown) return void showPreviousRoomTab(home.room);
      latest.current?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcut, enabled]);
}
