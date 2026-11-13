/** One tab of the room's strip, in the order the strip draws it. */
export type RoomTab = Readonly<{ key: string; closable: boolean }>;

export type RoomTabSources = Readonly<{
  groupKey: string;
  /** The extra tabs as the room keeps them: opened at the end, moved by the user. */
  order: readonly string[];
  /** The keys that have a tab now (extra grids and workspace items, no homes), in any order. */
  openKeys: readonly string[];
}>;

/** The one order of the room's tabs: the group first and fixed, then the open tabs in the order
 *  kept. An open key the order does not know yet goes at the end, as if just opened.
 *
 *  Example: `roomTabOrder({ groupKey: 'group', order: ['doc:a', 'torre'], openKeys: ['torre', 'doc:a'] })` */
export function roomTabOrder(sources: RoomTabSources): readonly RoomTab[] {
  const open = new Set(sources.openKeys);
  const kept = sources.order.filter((key) => open.has(key));
  const known = new Set(kept);
  const fresh = sources.openKeys.filter((key) => !known.has(key));
  return [
    { key: sources.groupKey, closable: false },
    ...[...kept, ...fresh].map((key) => ({ key, closable: true })),
  ];
}

/** The kept order after the workspace changed: an item closed leaves, one just opened goes to the
 *  end; the grids (`isGrid`) are the grid store's to add and drop. The same array when nothing
 *  changed, so the store publishes nothing.
 *
 *  Example: `syncedTabOrder(['torre'], (key) => key === 'torre', ['doc:a']) // ['torre', 'doc:a']` */
export function syncedTabOrder(
  order: readonly string[],
  isGrid: (key: string) => boolean,
  workspaceKeys: readonly string[],
): readonly string[] {
  const items = new Set(workspaceKeys);
  const kept = order.filter((key) => isGrid(key) || items.has(key));
  const fresh = workspaceKeys.filter((key) => !order.includes(key));
  if (kept.length === order.length && fresh.length === 0) return order;
  return [...kept, ...fresh];
}

/** The tab after (`1`) or before (`-1`) the shown one, wrapping around. A shown key with no tab
 *  (nothing yet, or a home) counts as the group tab.
 *
 *  Example: `neighbourTab(order, 'torre', 1)?.key // 'doc:a'` */
export function neighbourTab(
  order: readonly RoomTab[],
  shownKey: string | null,
  direction: 1 | -1,
): RoomTab | null {
  if (order.length === 0) return null;
  const shown = Math.max(
    0,
    order.findIndex((tab) => tab.key === shownKey),
  );
  return order[(shown + direction + order.length) % order.length] ?? null;
}

/** The n-th tab counted from 1, or `null` past the last.
 *
 *  Example: `nthTab(order, 1)?.key // 'group'` */
export function nthTab(order: readonly RoomTab[], n: number): RoomTab | null {
  if (n < 1) return null;
  return order[n - 1] ?? null;
}

/** The order kept before an F5 over the tabs back so far: the remembered keys that are open, or
 *  still on their way (`pending`), in their old places; then what opened that it did not know.
 *
 *  Example: `restoredTabOrder(['doc:a', 'torre'], ['torre'], new Set(['doc:a'])) // ['doc:a', 'torre']` */
export function restoredTabOrder(
  stored: readonly string[],
  current: readonly string[],
  pending: ReadonlySet<string>,
): readonly string[] {
  const open = new Set(current);
  const kept = stored.filter((key) => open.has(key) || pending.has(key));
  const known = new Set(kept);
  return [...kept, ...current.filter((key) => !known.has(key))];
}

/** Where the room lands when the tab it showed did not come back: the closest tab before `lost`
 *  in `order` still there, else the closest after it, else `null` (the group's).
 *
 *  Example: `fallbackTabKey(['torre', 'doc:a'], 'doc:a', (key) => key === 'torre') // 'torre'` */
export function fallbackTabKey(
  order: readonly string[],
  lost: string,
  alive: (key: string) => boolean,
): string | null {
  const at = order.indexOf(lost);
  if (at === -1) return null;
  const before = order.slice(0, at).reverse().find(alive);
  return before ?? order.slice(at + 1).find(alive) ?? null;
}
