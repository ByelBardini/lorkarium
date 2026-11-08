import type { LightDto, WallDto } from '@lorkarium/contracts';
import { coneOf, lightRange, type SceneSize } from '@lorkarium/game-core';
import { lightColorHex } from '@/lib/light-color';
import {
  NO_BLOCKERS,
  blockerIgnoresOf,
  wallsOnlyGeometryOf,
  type SightGeometry,
} from '@/lib/sight-geometry';
import type { BoardViewTool } from './board-view';
import { CELL_WORLD_SIZE, type Point } from './camera';
import { bandOrThrow, keptInBand, pointInBand, type WorldRect } from './grid-geometry';
import { lightAreasOf, type LightAreas } from './light-areas';

/** How far from its point an icon takes the pointer, in screen px (the icon is drawn 16 px wide). */
export const LIGHT_ICON_REACH = 16;

/** A map light as the master sees it: the icon on its point (world px), `full` with the lights
 *  tool and `faint` with any other; with the tool a lit light also shows what it lights. */
export type LightView = Readonly<{
  id: string;
  x: number;
  y: number;
  lit: boolean;
  /** The tone of the light (`lightColorHex`), kept when it is out; `null` for a neutral light. */
  color: number | null;
  /** Where it points and how wide it opens, in degrees (360 = every side). */
  facing: number;
  angle: number;
  emphasis: 'full' | 'faint';
  selected: boolean;
  /** The bright and dim areas, cut by the walls; `null` outside the tool or with the light out. */
  areas: LightAreas | null;
}>;

export type LightViewInput = Readonly<{
  lights: readonly LightDto[];
  walls: readonly WallDto[];
  scene: SceneSize;
  viewer: Readonly<{ isMaster: boolean }>;
  tool: BoardViewTool;
  selectedLightIds: readonly string[];
  /** The sight walls and the blockers of the board (absent: `walls`). */
  geometry?: SightGeometry;
}>;

const NO_GEOMETRY: SightGeometry = { walls: [], blockers: NO_BLOCKERS };

/** The icons of the map lights, for the master only: a player never sees the icon, only what the
 *  light lights (through the fog).
 *
 *  Example: `lightViewsOf({ lights, walls, scene, viewer, tool, selectedLightIds })` */
export function lightViewsOf(input: LightViewInput): LightView[] {
  if (!input.viewer.isMaster) return [];
  const tool = input.tool === 'lights';
  const geometry = tool ? (input.geometry ?? wallsOnlyGeometryOf(input.walls)) : NO_GEOMETRY;
  return input.lights.map((light) => ({
    id: light.id,
    x: light.x * CELL_WORLD_SIZE,
    y: light.y * CELL_WORLD_SIZE,
    lit: light.lit,
    color: lightColorHex(light.color),
    facing: light.facing,
    angle: light.angle,
    emphasis: tool ? 'full' : 'faint',
    selected: input.selectedLightIds.includes(light.id),
    areas: tool && light.lit ? areasOf(light, geometry, input.scene) : null,
  }));
}

/** The icon drawn on top under `world` (px), within 16 screen px of its point at `zoom`.
 *
 *  Example: `topLightAt(view.lights, world, camera.zoom)?.id` */
export function topLightAt(
  lights: readonly LightView[],
  world: Point,
  zoom: number,
): LightView | null {
  const reach = LIGHT_ICON_REACH / zoom;
  const topFirst = [...lights].reverse();
  return topFirst.find(({ x, y }) => Math.hypot(world.x - x, world.y - y) <= reach) ?? null;
}

/** The lights with the icon or what they light in `band` (world px); an area counts by its box,
 *  which keeps a few lights just off the band (cheap and safe). Nothing out gives back `lights`.
 *
 *  Example: `lightsInBand(view.lights, band).map(({ id }) => id)` */
export function lightsInBand(lights: readonly LightView[], band: WorldRect): readonly LightView[] {
  const checked = bandOrThrow(band);
  return keptInBand(lights, (light) => lightMeetsBand(light, checked));
}

function lightMeetsBand(light: LightView, band: WorldRect): boolean {
  if (pointInBand(light, band)) return true;
  if (!light.areas) return false;
  return boxMeetsBand(light.areas.dim, band) || boxMeetsBand(light.areas.bright, band);
}

function boxMeetsBand(polygon: readonly Point[], band: WorldRect): boolean {
  if (polygon.length === 0) return false;
  const xs = polygon.map(({ x }) => x);
  const ys = polygon.map(({ y }) => y);
  const crossesX = Math.min(...xs) <= band.x + band.width && Math.max(...xs) >= band.x;
  return crossesX && Math.min(...ys) <= band.y + band.height && Math.max(...ys) >= band.y;
}

function areasOf(
  light: LightDto,
  { walls, blockers }: SightGeometry,
  scene: SceneSize,
): LightAreas {
  const range = lightRange(light.bright, light.dim);
  const cone = coneOf(light.facing, light.angle);
  const center = { x: light.x, y: light.y };
  const source = { center, range, cone, ignores: blockerIgnoresOf(blockers, center) };
  return lightAreasOf(source, walls, scene);
}
