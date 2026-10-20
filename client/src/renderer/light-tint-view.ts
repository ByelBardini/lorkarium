import type { LightDto, SceneDto, TokenDto, WallDto } from '@lorkarium/contracts';
import { lightColorHex } from '@/lib/light-color';
import { shiningLightsOf, type TokenLanding } from '@/lib/light-sources';
import { gameWallOf } from '@/lib/wall-geometry';
import { CELL_WORLD_SIZE, type Point } from './camera';
import { lightAreasOf } from './light-areas';

/** One colored light: its tone and what it lights, in world px, cut by the walls. */
export type LightTint = Readonly<{
  color: number;
  bright: readonly Point[];
  dim: readonly Point[];
}>;

/** What the colored lights tint on a dark scene, in world px, in drawing order (the last one
 *  wins where two overlap). `key` changes only when any of it does, so the canvas redraws it only
 *  then. */
export type LightTintView = Readonly<{
  width: number;
  height: number;
  tints: readonly LightTint[];
  key: string;
}>;

export type LightTintInput = Readonly<{
  scene: SceneDto;
  walls: readonly WallDto[];
  lights: readonly LightDto[];
  tokens: readonly TokenDto[];
  /** Where dragged tokens would land: their lights tint from there, like the fog. */
  landing: TokenLanding;
}>;

/** The tint of the colored lights, or `null` with nothing to tint: a light only counts in the
 *  dark, so daylight and sight off tint nothing, and neutral or unlit lights never do. The same
 *  for every viewer; the fog above it hides what a player does not see.
 *
 *  Example: `lightTintViewOf({ scene, walls, lights, tokens, landing: new Map() })?.tints.length` */
export function lightTintViewOf(input: LightTintInput): LightTintView | null {
  const { scene } = input;
  if (scene.vision !== 'dark') return null;
  const size = { widthCells: scene.widthCells, heightCells: scene.heightCells };
  const walls = input.walls.map(gameWallOf);
  const tints = shiningLightsOf(input, input.landing).flatMap(({ source, color }) => {
    const hex = lightColorHex(color);
    if (hex === null) return [];
    return [{ color: hex, ...lightAreasOf(source, walls, size), source }];
  });
  if (tints.length === 0) return null;
  const blockers = input.walls.map(({ id, kind, x, y, doorState }) => [id, kind, x, y, doorState]);
  const lights = tints.map(({ color, source }) => [color, source.center, source.range]);
  return {
    width: size.widthCells * CELL_WORLD_SIZE,
    height: size.heightCells * CELL_WORLD_SIZE,
    tints: tints.map(({ color, bright, dim }) => ({ color, bright, dim })),
    key: JSON.stringify([size, blockers, lights]),
  };
}
