import type { SightBlocker } from '@lorkarium/game-core';
import { CELL_WORLD_SIZE, type Point } from './camera';
import type { WallStroke } from './wall-view';

/** The line of the blocker the master selected alone: its shape as it blocks now, one closed ring
 *  per island (the last point joins the first), in world px. */
export type SightBlockerOutlineView = Readonly<{ polygons: readonly (readonly Point[])[] }>;

export type SightBlockerOutlineInput = Readonly<{
  viewer: Readonly<{ isMaster: boolean }>;
  /** Those of `sightGeometryOf`, so the line is the shape that cuts sight, in the pose shown. */
  blockers: readonly SightBlocker[];
  selectedTokenIds: readonly string[];
}>;

const DASH_SCREEN_PX = 6;
const GAP_SCREEN_PX = 4;

// By the blocker's identity: the geometry hands back the same one while the shape stays, and the
// layer takes the same view as nothing to redraw.
const viewOfBlocker = new WeakMap<SightBlocker, SightBlockerOutlineView>();

/** What the master sees of the shape of a token that blocks sight: only for the master, only with
 *  that token selected alone; `null` otherwise (a token that is not blocking now included).
 *
 *  Example: `sightBlockerOutlineViewOf({ viewer, blockers: geometry.blockers, selectedTokenIds })` */
export function sightBlockerOutlineViewOf(
  input: SightBlockerOutlineInput,
): SightBlockerOutlineView | null {
  if (!input.viewer.isMaster || input.selectedTokenIds.length !== 1) return null;
  const [selectedId] = input.selectedTokenIds;
  const blocker = input.blockers.find(({ tokenId }) => tokenId === selectedId);
  return blocker ? rememberedViewOf(blocker) : null;
}

/** The dashes of the line, in world px, of a constant size on screen (PixiJS 8 has no dashed
 *  stroke). The run goes on around each ring: starting again at each vertex would close the many
 *  short sides of a disc into a solid line when far out.
 *
 *  Example: `for (const { from, to } of sightBlockerOutlineDashesOf(view, zoom)) line(from, to)` */
export function sightBlockerOutlineDashesOf(
  view: SightBlockerOutlineView,
  zoom: number,
): readonly WallStroke[] {
  const dash = DASH_SCREEN_PX / zoom;
  const period = (DASH_SCREEN_PX + GAP_SCREEN_PX) / zoom;
  return view.polygons.flatMap((polygon) => ringDashesOf(polygon, dash, period));
}

function rememberedViewOf(blocker: SightBlocker): SightBlockerOutlineView {
  const known = viewOfBlocker.get(blocker);
  if (known) return known;
  const view = {
    polygons: blocker.polygons.map((polygon) =>
      polygon.map(({ x, y }) => ({ x: x * CELL_WORLD_SIZE, y: y * CELL_WORLD_SIZE })),
    ),
  };
  viewOfBlocker.set(blocker, view);
  return view;
}

function ringDashesOf(ring: readonly Point[], dash: number, period: number): WallStroke[] {
  const dashes: WallStroke[] = [];
  let walked = 0;
  ring.forEach((from, index) => {
    const to = ring[(index + 1) % ring.length] ?? from;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    dashes.push(...sideDashesOf({ from, to }, length, walked % period, dash, period));
    walked += length;
  });
  return dashes;
}

// `phase`: how far into a period the side starts, so the dash cut by the last corner goes on here.
function sideDashesOf(
  side: WallStroke,
  length: number,
  phase: number,
  dash: number,
  period: number,
): WallStroke[] {
  const pieces: WallStroke[] = [];
  for (let start = -phase; start < length; start += period) {
    const from = Math.max(start, 0);
    const to = Math.min(start + dash, length);
    if (to > from) pieces.push({ from: along(side, from / length), to: along(side, to / length) });
  }
  return pieces;
}

function along({ from, to }: WallStroke, t: number): Point {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}
