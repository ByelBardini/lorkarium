export type TabOverflowSplit = Readonly<{ shown: readonly string[]; hidden: readonly string[] }>;

/** How many tabs of `minWidth` fit in `width`, keeping room for the "+N" button when some
 *  don't. An unmeasured strip (`width` 0) fits them all, so nothing hides before the first layout.
 *
 *  Example: `tabsThatFit({ width: 500, count: 6, minWidth: 112, moreWidth: 48 })` → 4 */
export function tabsThatFit(
  strip: Readonly<{ width: number; count: number; minWidth: number; moreWidth: number }>,
): number {
  if (strip.width <= 0 || strip.count * strip.minWidth <= strip.width) return strip.count;
  return Math.max(1, Math.floor((strip.width - strip.moreWidth) / strip.minWidth));
}

/** Splits the tabs into the ones drawn and the ones in the "+N" menu, in their order. The pinned
 *  ones (the group grid, the tab shown) are always drawn, even past `fit`.
 *
 *  Example: `splitTabsToFit(['grupo', 'torre', 'carta'], 2, ['grupo', 'carta'])` → shown grupo, carta */
export function splitTabsToFit(
  keys: readonly string[],
  fit: number,
  pinned: readonly string[],
): TabOverflowSplit {
  if (fit >= keys.length) return { shown: keys, hidden: [] };
  const pinnedHere = keys.filter((key) => pinned.includes(key));
  let room = Math.max(0, fit - pinnedHere.length);
  const shown = keys.filter((key) => {
    if (pinnedHere.includes(key)) return true;
    if (room === 0) return false;
    room -= 1;
    return true;
  });
  return { shown, hidden: keys.filter((key) => !shown.includes(key)) };
}
