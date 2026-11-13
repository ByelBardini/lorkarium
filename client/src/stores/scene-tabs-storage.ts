import { z } from 'zod';
import type { KeyValueStorage } from '@/stores/rail-store';

/** `sessionStorage` as the tab stores use it; injected so tests and blocked storage work. */
export type TabStorage = KeyValueStorage & Pick<Storage, 'removeItem'>;

export const SCENE_TABS_STORAGE_PREFIX = 'lorkarium.sceneTabs.';

const roomItemKinds = ['document', 'sheet', 'sheet-template', 'map'] as const;

/** A workspace item of the room as an F5 remembers it: what to look for in the library (`kind`,
 *  `id`) and the key of its tab. Never its content: a draft not saved does not come back. */
export type RoomItemRef = Readonly<{
  kind: (typeof roomItemKinds)[number];
  id: string;
  key: string;
}>;

/** What an F5 left for the room to reopen: `order` is the strip's as it was. */
export type RestoredRoomItems = Readonly<{
  items: readonly RoomItemRef[];
  activeItem: string | null;
  order: readonly string[];
}>;

/** The tabs of one table as this browser tab remembers them: the extra grids, the shown grid,
 *  the strip's order (grids and items mixed), the workspace items and the one shown, if any.
 *  `items` is absent in what an older build wrote: then only the grids come back. */
export type StoredSceneTabs = Readonly<{
  sceneIds: readonly string[];
  visible: string;
  order?: readonly string[] | undefined;
  items?: readonly RoomItemRef[] | undefined;
  activeItem?: string | null | undefined;
}>;

/** The same items, in the same order (a map tab that moved to another map is not the same).
 *
 *  Example: `sameRoomItemRefs(remembered, current) // false after a document opened` */
export function sameRoomItemRefs(a: readonly RoomItemRef[], b: readonly RoomItemRef[]): boolean {
  return (
    a.length === b.length && a.every((ref, at) => ref.key === b[at]?.key && ref.id === b[at].id)
  );
}

// Not a network DTO: only what this tab wrote for itself, read back defensively.
const storedSceneTabsSchema = z.object({
  sceneIds: z.array(z.string()),
  visible: z.string(),
  order: z.array(z.string()).optional(),
  items: z
    .array(z.object({ kind: z.enum(roomItemKinds), id: z.string(), key: z.string() }))
    .optional(),
  activeItem: z.string().nullable().optional(),
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
