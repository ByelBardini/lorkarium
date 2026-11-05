import type { LightDto, SceneDto, TokenDto, VeiledLightDto, WallDto } from '@lorkarium/contracts';
import {
  type Eye,
  type LightSource,
  type SceneSize,
  type SightBlocker,
  type Wall,
} from '@lorkarium/game-core';
import { eyeOfToken, levelOf, type BoardSight } from '@/lib/board-sight';
import { lightSourcesOf, type TokenLanding } from '@/lib/light-sources';
import { wallsOnlyGeometryOf, type SightGeometry } from '@/lib/sight-geometry';
import { CELL_WORLD_SIZE, type Point } from './camera';
import { lightAreasOf } from './light-areas';
import { ignoresIdOf, rememberedWorldAreaOf, wallSetIdOf } from './world-area';

/** A rectangle in world px. */
export type FogRect = Readonly<{ x: number; y: number; width: number; height: number }>;
type FogAreas = readonly (readonly Point[])[];

/** The fog of this viewer, in world px: opaque black outside every `dim` area, darkened outside
 *  every `bright` area, with `holes` where the viewer's own tokens stand. What the lights light
 *  (`lit`, cut by the walls) opens the fog too, but only inside some eye's line of sight
 *  (`sightLines`, unlimited, cut by the walls): (∪ sight) ∩ (∪ light). A blocker the viewer sees
 *  shows its own body (`blockerHoles`), which is behind its own outline: on both sheets when seen,
 *  on the opaque one (`dim`) alone as a silhouette. `key` changes only when any of it does, so the
 *  canvas redraws it only then. */
export type FogView = Readonly<{
  width: number;
  height: number;
  dim: FogAreas;
  bright: FogAreas;
  holes: readonly FogRect[];
  lit: Readonly<{ bright: FogAreas; dim: FogAreas }>;
  sightLines: FogAreas;
  blockerHoles: Readonly<{ bright: FogAreas; dim: FogAreas }>;
  key: string;
}>;

export type FogViewInput = Readonly<{
  sight: BoardSight;
  scene: SceneDto;
  walls: readonly WallDto[];
  lights: readonly LightDto[];
  tokens: readonly TokenDto[];
  /** The lights of the hidden tokens this viewer does not receive (absent: none). */
  veiledLights?: readonly VeiledLightDto[];
  /** Where the viewer's tokens show and look (dragged, waiting, turned): the fog follows them. */
  landing: TokenLanding;
  /** The sight walls and the blockers of the board (absent: `walls`). */
  geometry?: SightGeometry;
}>;

type PlacedEye = Readonly<{ eye: Eye; hole: FogRect }>;
type FogGeometry = Readonly<{
  walls: readonly Wall[];
  blockers: readonly SightBlocker[];
  size: SceneSize;
}>;

// A change that leaves the eyes, the walls and the lights alone (the ruler, a selection, a remote
// drag of anyone else) asks again with the same key: the last fog is handed back whole.
let lastFog: FogView | null = null;

/** The fog over the board, or `null` when nothing is hidden (sight off, the master not
 *  previewing). Each eye's areas come from the game-core `sightArea` (cut by the walls and the
 *  scene); by daylight the bright area has no limit, there is no penumbra and lights add nothing.
 *  The eyes and the lights are placed first (cheap) and the key worked out from them: the same key
 *  gives back the very same `FogView`, and only a new one goes to `sightArea`.
 *
 *  Example: `fogViewOf({ sight, scene, walls, lights, tokens, landing: new Map() })?.dim.length` */
export function fogViewOf(input: FogViewInput): FogView | null {
  const { sight, scene } = input;
  if (!sight.active) return null;
  const size = { widthCells: scene.widthCells, heightCells: scene.heightCells };
  const geometry = { ...(input.geometry ?? wallsOnlyGeometryOf(input.walls)), size };
  const placed = placedEyesOf(input, geometry.blockers);
  const sources =
    sight.mode === 'dark' ? lightSourcesOf(input, input.landing, geometry.blockers) : [];
  const key = keyOf(sight, placed, geometry, sources);
  if (lastFog?.key === key) return lastFog;
  lastFog = fogGeometryOf(sight, placed, geometry, sources, key);
  return lastFog;
}

function fogGeometryOf(
  sight: BoardSight,
  placed: readonly PlacedEye[],
  geometry: FogGeometry,
  sources: readonly LightSource[],
  key: string,
): FogView {
  const own = ownAreasOf(placed, geometry, sight.mode === 'daylight');
  const lit = litAreasOf(sources, geometry);
  const sightLines =
    lit.dim.length > 0 ? placed.map(({ eye }) => areaOf(eye, geometry, Infinity)) : [];
  const holes = placed.map(({ hole }) => hole);
  const width = geometry.size.widthCells * CELL_WORLD_SIZE;
  const height = geometry.size.heightCells * CELL_WORLD_SIZE;
  const blockerHoles = blockerHolesOf(sight, geometry.blockers);
  return { width, height, ...own, holes, lit, sightLines, blockerHoles, key };
}

// The viewer's own tokens (or the master's preview) in the pose they show: every one is an eye
// (in its field) and a hole, with or without darkvision.
function placedEyesOf(
  { sight, tokens, landing }: FogViewInput,
  blockers: readonly SightBlocker[],
): PlacedEye[] {
  const watched = tokens.filter(({ id }) => sight.eyeTokenIds.includes(id));
  return watched.map((token) => {
    const at = landing.get(token.id) ?? token;
    const hole = {
      x: at.col * CELL_WORLD_SIZE,
      y: at.row * CELL_WORLD_SIZE,
      width: token.width * CELL_WORLD_SIZE,
      height: token.height * CELL_WORLD_SIZE,
    };
    return { eye: eyeOfToken(token, landing, blockers), hole };
  });
}

// What the eyes see by their own range (darkvision); an eye without one has no area of its own.
function ownAreasOf(placed: readonly PlacedEye[], geometry: FogGeometry, daylight: boolean) {
  const reachOf = ({ range }: Eye, part: 'bright' | 'both'): number => {
    if (daylight) return Infinity;
    if (!range) return 0;
    return part === 'bright' ? range.bright : range.bright + range.dim;
  };
  const areas = (part: 'bright' | 'both'): Point[][] =>
    placed.flatMap(({ eye }) => {
      const area = areaOf(eye, geometry, reachOf(eye, part));
      return area.length > 0 ? [area] : [];
    });
  const bright = areas('bright');
  return { bright, dim: daylight ? bright : areas('both') };
}

function litAreasOf(sources: readonly LightSource[], { walls, size }: FogGeometry): FogView['lit'] {
  const areas = sources.map((source) => lightAreasOf(source, walls, size));
  const present = (area: readonly Point[]): boolean => area.length > 0;
  return {
    bright: areas.map(({ bright }) => bright).filter(present),
    dim: areas.map(({ dim }) => dim).filter(present),
  };
}

function areaOf(eye: Eye, { walls, size }: FogGeometry, reach: number): Point[] {
  const { center, field, ignores } = eye;
  return rememberedWorldAreaOf(center, walls, size, reach, field ?? undefined, ignores);
}

function blockerHolesOf(
  sight: BoardSight,
  blockers: readonly SightBlocker[],
): FogView['blockerHoles'] {
  const bright: Point[][] = [];
  const dim: Point[][] = [];
  for (const { tokenId, polygons } of blockers) {
    const level = levelOf(sight, tokenId);
    if (level === 'hidden') continue;
    const body = polygons.map((polygon) =>
      polygon.map(({ x, y }) => ({ x: x * CELL_WORLD_SIZE, y: y * CELL_WORLD_SIZE })),
    );
    dim.push(...body);
    if (level === 'seen') bright.push(...body);
  }
  return { bright, dim };
}

// The walls go in by the identity of their array: a door opening hands a new one.
function keyOf(
  sight: BoardSight,
  placed: readonly PlacedEye[],
  { walls, blockers, size }: FogGeometry,
  sources: readonly LightSource[],
): string {
  const eyes = placed.map(({ eye, hole }) => [
    eye.center,
    eye.range,
    eye.field,
    hole.x,
    hole.y,
    ignoresIdOf(eye.ignores),
  ]);
  const lights = sources.map(({ center, range, cone, ignores }) => [
    center,
    range,
    cone,
    ignoresIdOf(ignores),
  ]);
  const bodies = blockers.map(({ tokenId }) => levelOf(sight, tokenId));
  return JSON.stringify([sight.mode, size, eyes, wallSetIdOf(walls), lights, bodies]);
}
