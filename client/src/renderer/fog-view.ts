import type { SceneDto, TokenDto, WallDto } from '@lorkarium/contracts';
import {
  eyeOf,
  sightArea,
  sightRange,
  tokenCenter,
  type Eye,
  type Vector2,
} from '@lorkarium/game-core';
import type { BoardSight } from '@/lib/board-sight';
import { gameWallOf } from '@/lib/wall-geometry';
import { CELL_WORLD_SIZE, type Point } from './camera';

/** A rectangle in world px. */
export type FogRect = Readonly<{ x: number; y: number; width: number; height: number }>;

/** The fog of this viewer, in world px: opaque black outside every `dim` area, darkened outside
 *  every `bright` area, with `holes` where the viewer's own tokens stand. `key` changes only when
 *  any of it does, so the canvas redraws it only then. */
export type FogView = Readonly<{
  width: number;
  height: number;
  dim: readonly (readonly Point[])[];
  bright: readonly (readonly Point[])[];
  holes: readonly FogRect[];
  key: string;
}>;

export type FogViewInput = Readonly<{
  sight: BoardSight;
  scene: SceneDto;
  walls: readonly WallDto[];
  tokens: readonly TokenDto[];
  /** Where the viewer's dragged tokens would land: the fog follows them before the move. */
  landing: ReadonlyMap<string, Readonly<{ col: number; row: number }>>;
}>;

type PlacedEye = Readonly<{ eye: Eye; hole: FogRect }>;

/** The fog over the board, or `null` when nothing is hidden (sight off, the master not
 *  previewing). Each eye's areas come from the game-core `sightArea` (cut by the walls and the
 *  scene); by daylight the bright area has no limit and there is no penumbra.
 *
 *  Example: `fogViewOf({ sight, scene, walls, tokens, landing: new Map() })?.dim.length` */
export function fogViewOf(input: FogViewInput): FogView | null {
  const { sight, scene } = input;
  if (!sight.active) return null;
  const size = { widthCells: scene.widthCells, heightCells: scene.heightCells };
  const walls = input.walls.map(gameWallOf);
  const placed = placedEyesOf(input);
  const daylight = sight.mode === 'daylight';
  const areaOf = (eye: Eye, reach: number): Point[] =>
    sightArea(eye.center, walls, size, reach).map(worldOf);
  const bright = placed.map(({ eye }) => areaOf(eye, daylight ? Infinity : rangeOf(eye, 'bright')));
  const dim = daylight ? bright : placed.map(({ eye }) => areaOf(eye, rangeOf(eye, 'both')));
  const holes = placed.map(({ hole }) => hole);
  const width = size.widthCells * CELL_WORLD_SIZE;
  const height = size.heightCells * CELL_WORLD_SIZE;
  return { width, height, dim, bright, holes, key: keyOf(sight, placed, input.walls) };
}

// The viewer's own tokens (or the master's preview) at the cell they would land on.
function placedEyesOf({ sight, tokens, landing }: FogViewInput): PlacedEye[] {
  const watched = tokens.filter(({ id }) => sight.eyeTokenIds.includes(id));
  return watched.flatMap((token) => {
    const at = landing.get(token.id) ?? token;
    const range = token.sight ? sightRange(token.sight.bright, token.sight.dim) : null;
    const eye = eyeOf(tokenCenter(at, token), range, sight.mode);
    const hole = {
      x: at.col * CELL_WORLD_SIZE,
      y: at.row * CELL_WORLD_SIZE,
      width: token.width * CELL_WORLD_SIZE,
      height: token.height * CELL_WORLD_SIZE,
    };
    return eye ? [{ eye, hole }] : [];
  });
}

function rangeOf({ range }: Eye, part: 'bright' | 'both'): number {
  if (!range) return 0;
  return part === 'bright' ? range.bright : range.bright + range.dim;
}

function worldOf({ x, y }: Vector2): Point {
  return { x: x * CELL_WORLD_SIZE, y: y * CELL_WORLD_SIZE };
}

function keyOf(sight: BoardSight, placed: readonly PlacedEye[], walls: readonly WallDto[]): string {
  const eyes = placed.map(({ eye, hole }) => [eye.center, eye.range, hole.x, hole.y]);
  const blockers = walls.map(({ id, kind, x, y, doorState }) => [id, kind, x, y, doorState]);
  return JSON.stringify([sight.mode, eyes, blockers]);
}
