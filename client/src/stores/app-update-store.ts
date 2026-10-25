import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { PublishedBuild } from '@/services/published-build';

export type AppUpdateStore = Readonly<{
  /** The server publishes another client build than the one running in this page. */
  stale: boolean;
  /** Asks the server which build it publishes; once stale, it stops asking. */
  check: () => Promise<void>;
}>;

export type AppUpdateOptions = Readonly<{
  /** The `buildFingerprintOf` this page booted with; `''` (dev) never turns stale. */
  running: string;
  published: PublishedBuild;
}>;

/** Whether a deploy changed the client under the open page (the desktop shell has no F5).
 *  An unreadable answer is no news: the server may be in the middle of the deploy.
 *
 *  Example: `createAppUpdateStore({ running: buildFingerprintOf(document), published }).getState().check()` */
export function createAppUpdateStore({
  running,
  published,
}: AppUpdateOptions): StoreApi<AppUpdateStore> {
  // Focus and visibility fire together when the window comes back: one request answers both.
  let asking: Promise<void> | null = null;
  return createStore<AppUpdateStore>()((set, get) => {
    const ask = async (): Promise<void> => {
      const fingerprint = await published.fingerprint();
      if (fingerprint !== null && fingerprint !== '' && fingerprint !== running)
        set({ stale: true });
    };
    return {
      stale: false,
      check: () => {
        if (running === '' || get().stale) return Promise.resolve();
        asking ??= ask().finally(() => (asking = null));
        return asking;
      },
    };
  });
}

/** React view of `stale` (re-renders when a new build shows up).
 *
 *  Example: `const stale = useAppUpdateStale(appUpdate)` */
export function useAppUpdateStale(store: StoreApi<AppUpdateStore>): boolean {
  return useStore(store, (state) => state.stale);
}
