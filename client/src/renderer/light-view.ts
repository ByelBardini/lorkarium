import type { LightDto, WallDto } from '@lorkarium/contracts';
import { lightRange, type SceneSize } from '@lorkarium/game-core';
import { lightColorHex } from '@/lib/light-color';
import { gameWallOf } from '@/lib/wall-geometry';
import type { BoardViewTool } from './board-view';
import { CELL_WORLD_SIZE, type Point } from './camera';
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
}>;

/** The icons of the map lights, for the master only: a player never sees the icon, only what the
 *  light lights (through the fog).
 *
 *  Example: `lightViewsOf({ lights, walls, scene, viewer, tool, selectedLightIds })` */
export function lightViewsOf(input: LightViewInput): LightView[] {
  if (!input.viewer.isMaster) return [];
  const tool = input.tool === 'lights';
  const walls = tool ? input.walls.map(gameWallOf) : [];
  return input.lights.map((light) => ({
    id: light.id,
    x: light.x * CELL_WORLD_SIZE,
    y: light.y * CELL_WORLD_SIZE,
    lit: light.lit,
    color: lightColorHex(light.color),
    emphasis: tool ? 'full' : 'faint',
    selected: input.selectedLightIds.includes(light.id),
    areas: tool && light.lit ? areasOf(light, walls, input.scene) : null,
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

function areasOf(
  light: LightDto,
  walls: Parameters<typeof lightAreasOf>[1],
  scene: SceneSize,
): LightAreas {
  const source = { center: { x: light.x, y: light.y }, range: lightRange(light.bright, light.dim) };
  return lightAreasOf(source, walls, scene);
}
