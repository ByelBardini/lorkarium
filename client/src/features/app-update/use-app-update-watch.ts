import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { editableFieldOf } from '@/features/text-field-menu/text-field-target';
import { useAppUpdateStale, type AppUpdateStore } from '@/stores/app-update-store';

/** How often an open page asks which build is published, besides focus and reconnect. */
export const APP_UPDATE_CHECK_MS = 5 * 60_000;

export type AppUpdateWatchOptions = Readonly<{
  appUpdate: StoreApi<AppUpdateStore>;
  /** `location.reload()` in the app. */
  reloadPage: () => void;
}>;

/** Keeps asking whether a deploy changed the client and, once it did, reloads when nobody loses
 *  anything: the page is hidden (the desktop window in the tray, a background tab) with no text
 *  field focused, or the person navigates to another route. Mounted once, by `AppUpdateNotice`.
 *
 *  Example: `useAppUpdateWatch({ appUpdate, reloadPage: () => location.reload() })` */
export function useAppUpdateWatch({ appUpdate, reloadPage }: AppUpdateWatchOptions): void {
  useCheckWhileOpen(appUpdate);
  const stale = useAppUpdateStale(appUpdate);
  useReloadWhenHidden(stale, reloadPage);
  useReloadOnNavigation(stale, reloadPage);
}

function useCheckWhileOpen(appUpdate: StoreApi<AppUpdateStore>): void {
  useEffect(() => {
    const check = (): void => void appUpdate.getState().check();
    const checkWhenShown = (): void => {
      if (document.visibilityState === 'visible') check();
    };
    const timer = setInterval(check, APP_UPDATE_CHECK_MS);
    document.addEventListener('visibilitychange', checkWhenShown);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', checkWhenShown);
      window.removeEventListener('focus', check);
    };
  }, [appUpdate]);
}

function useReloadWhenHidden(stale: boolean, reloadPage: () => void): void {
  useEffect(() => {
    if (!stale) return;
    const reloadIfHidden = (): void => {
      if (document.visibilityState !== 'hidden') return;
      if (editableFieldOf(document.activeElement) === null) reloadPage();
    };
    reloadIfHidden();
    document.addEventListener('visibilitychange', reloadIfHidden);
    return () => document.removeEventListener('visibilitychange', reloadIfHidden);
  }, [stale, reloadPage]);
}

// The route the page was on when the build turned stale; leaving it is the person's own move,
// so the full load in its place costs nothing the navigation would not.
function useReloadOnNavigation(stale: boolean, reloadPage: () => void): void {
  const { key } = useLocation();
  const staleOn = useRef<string | null>(null);
  useEffect(() => {
    if (!stale) return;
    if (staleOn.current === null) staleOn.current = key;
    else if (staleOn.current !== key) reloadPage();
  }, [stale, key, reloadPage]);
}
