import { useStore } from 'zustand';
import type { ImagePresentationStateDto } from '@lorkarium/contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ImagePresentationApi } from '@/services/image-presentation-api';
import type { LibraryFailure } from '@/services/library-api';
import type { TabStorage } from './scene-tabs-storage';

export type ImagePresentationStore = Readonly<{
  campaignId: string;
  version: number;
  presentation: ImagePresentationStateDto['presentation'];
  dismissed: boolean;
  failure: LibraryFailure | null;
  apply: (snapshot: ImagePresentationStateDto, historical?: boolean) => void;
  setViewing: (viewing: boolean) => void;
  sync: () => Promise<void>;
  dismiss: () => void;
  clear: () => void;
}>;

type PresentationDeps = Readonly<{
  campaignId: string;
  userId: string;
  storage: TabStorage;
  api?: ImagePresentationApi;
}>;

/** Versioned state independent of scene/presence versions. Example: `store.getState().dismiss()`. */
export function createImagePresentationStore(
  deps: PresentationDeps,
): StoreApi<ImagePresentationStore> {
  const key = `lorkarium.imagePresentation.${deps.userId}.${deps.campaignId}`;
  let dismissedId = readDismissal(deps.storage, key);
  let disposed = false;
  let viewing = false;
  return createStore<ImagePresentationStore>()((set, get) => ({
    campaignId: deps.campaignId,
    version: -1,
    presentation: null,
    dismissed: false,
    failure: null,
    apply: (snapshot, historical = false) => {
      if (disposed || snapshot.campaignId !== deps.campaignId || snapshot.version <= get().version)
        return;
      set({
        version: snapshot.version,
        presentation: snapshot.presentation,
        dismissed:
          snapshot.presentation !== null &&
          (!viewing || historical || snapshot.presentation.id === dismissedId),
        failure: null,
      });
      if (snapshot.presentation && (!viewing || historical)) get().dismiss();
    },
    setViewing: (visible) => {
      if (disposed) return;
      viewing = visible;
      if (get().presentation) get().dismiss();
    },
    sync: async () => {
      if (!deps.api || disposed) return;
      const result = await deps.api.snapshot(deps.campaignId);
      if (disposed) return;
      if (result.ok) {
        get().apply(result.value, get().version < 0);
        set({ failure: null });
      } else set({ failure: result.failure });
    },
    dismiss: () => {
      dismissedId = get().presentation?.id ?? null;
      set({ dismissed: true });
      try {
        deps.storage.setItem(key, JSON.stringify(dismissedId));
      } catch {
        /* memory fallback */
      }
    },
    clear: () => {
      disposed = true;
      dismissedId = null;
      set({ version: -1, presentation: null, dismissed: false, failure: null });
      try {
        deps.storage.removeItem(key);
      } catch {
        /* memory fallback */
      }
    },
  }));
}

function readDismissal(storage: TabStorage, key: string): string | null {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? 'null');
    return typeof parsed === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

/** React subscription to presentation state. Example: `useImagePresentation(store, (state) => state.presentation)`. */
export function useImagePresentation<T>(
  store: StoreApi<ImagePresentationStore>,
  selector: (state: ImagePresentationStore) => T,
): T {
  return useStore(store, selector);
}
