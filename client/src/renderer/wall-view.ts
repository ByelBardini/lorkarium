import type { DoorStateDto, WallDto, WallKindDto } from '@lorkarium/contracts';
import { HIT_TOLERANCE } from '@/lib/drawing-geometry';
import { wallSegmentsOf } from '@/lib/wall-geometry';
import type { BoardViewTool } from './board-view';
import { CELL_WORLD_SIZE, type Point } from './camera';

/** What a press does with the walls tool: start a wall, drag the eraser box, or erase a wall (or a piece). */
export type WallMode = 'draw' | 'eraseArea' | 'eraseWall' | 'eraseSegment';

/** A wall under the pointer and its piece there (the `wallSegments` index). */
export type WallTarget = Readonly<{ wallId: string; segmentIndex: number }>;

/** A straight piece of a wall in world px. */
export type WallStroke = Readonly<{ from: Point; to: Point }>;

/** A wall line as the master sees it: `full` with the walls tool, `faint` with any other. */
export type WallView = Readonly<{
  id: string;
  kind: WallKindDto;
  doorState: DoorStateDto | null;
  segments: readonly WallStroke[];
  emphasis: 'full' | 'faint';
  selected: boolean;
}>;

/** The icon of a door, in the middle of its line (world px). */
export type DoorIconView = Readonly<{ wallId: string; x: number; y: number; state: DoorStateDto }>;

export type WallViewInput = Readonly<{
  walls: readonly WallDto[];
  viewer: Readonly<{ isMaster: boolean }>;
  tool: BoardViewTool;
  selectedWallIds: readonly string[];
  /** The doors a player's tokens see; `null` when sight is off (every door). */
  seenDoorIds: ReadonlySet<string> | null;
  /** The master sees the table through a player's eyes ("ver como jogador"). */
  previewing: boolean;
}>;

/** The lines of the walls, for the master only: a player never sees a wall drawn, only what it
 *  hides (the fog) and the doors they see. Previewing a player, the master sees it that way too,
 *  except with the walls tool on.
 *
 *  Example: `wallViewsOf({ walls, viewer, tool, selectedWallIds, seenDoorIds, previewing })` */
export function wallViewsOf(input: WallViewInput): WallView[] {
  if (!input.viewer.isMaster) return [];
  if (input.previewing && input.tool !== 'walls') return [];
  const emphasis = input.tool === 'walls' ? 'full' : 'faint';
  return input.walls.map((wall) => ({
    id: wall.id,
    kind: wall.kind,
    doorState: wall.doorState,
    segments: strokesOf(wall),
    emphasis,
    selected: input.selectedWallIds.includes(wall.id),
  }));
}

/** The icon of each door this viewer may click: every door for the master (and with sight off),
 *  only the seen ones for a player.
 *
 *  Example: `doorIconsOf(input).map(({ wallId }) => wallId)` */
export function doorIconsOf(input: WallViewInput): DoorIconView[] {
  const doors = input.walls.filter(({ kind, doorState }) => kind === 'door' && doorState);
  const visible = input.viewer.isMaster
    ? doors
    : doors.filter(({ id }) => input.seenDoorIds?.has(id) ?? true);
  return visible.flatMap((door) => {
    const [stroke] = strokesOf(door);
    if (!stroke || !door.doorState) return [];
    const x = (stroke.from.x + stroke.to.x) / 2;
    const y = (stroke.from.y + stroke.to.y) / 2;
    return [{ wallId: door.id, x, y, state: door.doorState }];
  });
}

/** The size of a door icon on screen, whatever the zoom. */
export const DOOR_ICON_SCREEN_PX = 16;

/** The door whose icon is under `world` (px) at this zoom, or `null`.
 *
 *  Example: `doorIconAt(view.doors, world, camera.zoom)?.wallId` */
export function doorIconAt(
  doors: readonly DoorIconView[],
  world: Point,
  zoom: number,
): DoorIconView | null {
  const half = DOOR_ICON_SCREEN_PX / 2 / zoom;
  const hit = (door: DoorIconView): boolean =>
    Math.abs(world.x - door.x) <= half && Math.abs(world.y - door.y) <= half;
  return [...doors].reverse().find(hit) ?? null;
}

/** The wall whose line passes within 0.15 cell of `world` (px), the last drawn first.
 *
 *  Example: `topWallAt(view.walls, world)?.id` */
export function topWallAt(walls: readonly WallView[], world: Point): WallView | null {
  const target = wallTargetAt(walls, world);
  return walls.find(({ id }) => id === target?.wallId) ?? null;
}

/** The top wall within 0.15 cell of `world` (px) and its piece nearest to it, or `null`.
 *
 *  Example: `wallTargetAt(view.walls, world) // { wallId, segmentIndex: 1 }` */
export function wallTargetAt(walls: readonly WallView[], world: Point): WallTarget | null {
  const reach = HIT_TOLERANCE * CELL_WORLD_SIZE;
  for (const wall of [...walls].reverse()) {
    const distances = wall.segments.map((stroke) => distanceTo(stroke, world));
    const nearest = Math.min(...distances);
    if (nearest <= reach) return { wallId: wall.id, segmentIndex: distances.indexOf(nearest) };
  }
  return null;
}

/** The strokes a click would erase, lit under the pointer: the whole wall, or only the piece.
 *
 *  Example: `erasedStrokesOf(view.walls, wallTargetAt(view.walls, world), 'eraseSegment')` */
export function erasedStrokesOf(
  walls: readonly WallView[],
  target: WallTarget | null,
  mode: WallMode,
): WallStroke[] {
  const wall = target && walls.find(({ id }) => id === target.wallId);
  if (!wall || (mode !== 'eraseWall' && mode !== 'eraseSegment')) return [];
  if (mode === 'eraseWall') return [...wall.segments];
  const piece = wall.segments[target.segmentIndex];
  return piece ? [piece] : [];
}

function strokesOf(wall: WallDto): WallStroke[] {
  return wallSegmentsOf(wall).map(({ from, to }) => ({ from: worldOf(from), to: worldOf(to) }));
}

function worldOf({ x, y }: Readonly<{ x: number; y: number }>): Point {
  return { x: x * CELL_WORLD_SIZE, y: y * CELL_WORLD_SIZE };
}

function distanceTo({ from, to }: WallStroke, point: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = dx * dx + dy * dy;
  const along = length === 0 ? 0 : ((point.x - from.x) * dx + (point.y - from.y) * dy) / length;
  const t = Math.min(1, Math.max(0, along));
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}

/** The pieces of a stroke drawn with a dash `pattern` ([on, off] in world px); a solid line is
 *  `null` (one piece). The canvas has no dashed line of its own.
 *
 *  Example: `dashesOf({ from: { x: 0, y: 0 }, to: { x: 20, y: 0 } }, [6, 4])` → 2 pieces */
export function dashesOf(
  stroke: WallStroke,
  pattern: readonly [number, number] | null,
): WallStroke[] {
  if (!pattern) return [stroke];
  const [on, off] = pattern;
  const length = Math.hypot(stroke.to.x - stroke.from.x, stroke.to.y - stroke.from.y);
  const pieces: WallStroke[] = [];
  for (let start = 0; start < length; start += on + off) {
    const end = Math.min(start + on, length);
    pieces.push({ from: along(stroke, start / length), to: along(stroke, end / length) });
  }
  return pieces;
}

function along({ from, to }: WallStroke, t: number): Point {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}
