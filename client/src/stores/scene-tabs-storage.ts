import { z } from 'zod';
import type { KeyValueStorage } from '@/stores/rail-store';

/** `sessionStorage` as the tab stores use it; injected so tests and blocked storage work. */
export type TabStorage = KeyValueStorage & Pick<Storage, 'removeItem'>;

export const SCENE_TABS_STORAGE_PREFIX = 'lorkarium.sceneTabs.';

/** The extra grid tabs of one table as this browser tab remembers them, and the one shown. */
export type StoredSceneTabs = Readonly<{ sceneIds: readonly string[]; visible: string }>;

// Not a network DTO: only what this tab wrote for itself, read back defensively.
const storedSceneTabsSchema = z.object({
  sceneIds: z.array(z.string()),
  visible: z.string(),
});

/** The tabs remembered for `campaignId`, or `null` when none (or unreadable, or the storage
 *  throws: private mode or blocked site data).
 *
 *  Example: `readSceneTabs(sessionStorage, campaignId)?.sceneIds` */
export function readSceneTabs(storage: TabStorage, campaignId: string): StoredSceneTabs | null {
  try {
    const raw = storage.getItem(SCENE_TABS_STORAGE_PREFIX + campaignId);
    if (raw === null) return null;
    const parsed = storedSceneTabsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Remembers the tabs of `campaignId`; a storage that throws keeps them only in memory.
 *
 *  Example: `writeSceneTabs(sessionStorage, campaignId, { sceneIds: [torreId], visible: torreId })` */
export function writeSceneTabs(
  storage: TabStorage,
  campaignId: string,
  tabs: StoredSceneTabs,
): void {
  try {
    storage.setItem(SCENE_TABS_STORAGE_PREFIX + campaignId, JSON.stringify(tabs));
  } catch {
    // Keeps working in memory for this visit.
  }
}

/** Forgets the tabs of `campaignId` (the table was closed).
 *
 *  Example: `forgetSceneTabs(sessionStorage, campaignId)` */
export function forgetSceneTabs(storage: TabStorage, campaignId: string): void {
  try {
    storage.removeItem(SCENE_TABS_STORAGE_PREFIX + campaignId);
  } catch {
    // Nothing was stored to begin with.
  }
}
