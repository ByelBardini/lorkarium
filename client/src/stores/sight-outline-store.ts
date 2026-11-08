import type { SightOutline } from '@lorkarium/game-core';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { SightOutlines } from '@/lib/sight-geometry';
import type { AssetOutlineApi, AssetOutlineResult } from '@/services/assets-api';

/** The outlines of the images fetched so far. `outlines` holds the same map until new ones arrive;
 *  `request` fetches what was never asked, and the promise settles once they are in. */
export type SightOutlineStore = Readonly<{
  outlines: SightOutlines;
  request: (assetIds: readonly string[]) => Promise<void>;
}>;

/** One fetch per asset for the life of the store: an asset's outline never changes. A failure stays
 *  as `null` (the rectangle) until the room is entered again, so a table that asks at every change
 *  never loops on it. The outlines of one request arrive together, one new geometry for all.
 *
 *  Example: `await createSightOutlineStore(assets).getState().request([token.imageAssetId])` */
export function createSightOutlineStore(api: AssetOutlineApi): StoreApi<SightOutlineStore> {
  const asked = new Set<string>();
  return createStore<SightOutlineStore>()((set, get) => ({
    outlines: new Map(),
    request: async (assetIds) => {
      const fresh = [...new Set(assetIds)].filter((assetId) => !asked.has(assetId));
      if (fresh.length === 0) return;
      fresh.forEach((assetId) => asked.add(assetId));
      const answers = await Promise.all(
        fresh.map(async (assetId) => [assetId, outlineIn(await api.outlineOf(assetId))] as const),
      );
      set({ outlines: new Map([...get().outlines, ...answers]) });
    },
  }));
}

function outlineIn(answer: AssetOutlineResult): SightOutline | null {
  return answer.ok ? answer.outline : null;
}

/** React view of a slice of the outlines.
 *
 *  Example: `const outlines = useSightOutlines(store, (state) => state.outlines)` */
export function useSightOutlines<T>(
  store: StoreApi<SightOutlineStore>,
  selector: (state: SightOutlineStore) => T,
): T {
  return useStore(store, selector);
}
