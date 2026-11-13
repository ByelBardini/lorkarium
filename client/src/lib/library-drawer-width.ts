export const LIBRARY_DRAWER_DEFAULT_WIDTH = 420;

export const LIBRARY_DRAWER_MIN_WIDTH = 320;

export const LIBRARY_DRAWER_MAX_WIDTH = 1100;

/** Where "Ampliar" takes the drawer: wide enough for the tree and the panel side by side. */
export const LIBRARY_DRAWER_WIDE_WIDTH = 960;

const WIDE_FROM = 720;

/** The library drawer width that fits the room: 320 to 1100 px and at most 70% of the room (in
 *  whole pixels), so the board always keeps 30%. A width that is not a positive number is the
 *  default; a room under 320 px gets the drawer over all of it.
 *
 *  Example: `clampLibraryDrawerWidth(1500, 1200)` → `840` */
export function clampLibraryDrawerWidth(width: number, roomWidth: number): number {
  if (roomWidth < LIBRARY_DRAWER_MIN_WIDTH) return Math.max(0, Math.floor(roomWidth));
  const wanted = Number.isFinite(width) && width > 0 ? width : LIBRARY_DRAWER_DEFAULT_WIDTH;
  const ceiling = Math.min(LIBRARY_DRAWER_MAX_WIDTH, Math.floor((roomWidth * 7) / 10));
  return Math.round(Math.min(Math.max(wanted, LIBRARY_DRAWER_MIN_WIDTH), ceiling));
}

/** Whether a drawer this wide shows the tree and the item side by side (else one at a time).
 *
 *  Example: `isWideLibraryDrawer(420) // false` */
export function isWideLibraryDrawer(width: number): boolean {
  return width >= WIDE_FROM;
}
