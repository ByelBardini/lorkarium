import type { LightDto, SceneDto, TokenDto, VeiledLightDto, WallDto } from '@lorkarium/contracts';
import { lightColorHex } from '@/lib/light-color';
import { shiningLightsOf, type TokenLanding } from '@/lib/light-sources';
import { gameWallsOf } from '@/lib/wall-geometry';
import { CELL_WORLD_SIZE, type Point } from './camera';
import { lightAreasOf } from './light-areas';
import { wallSetIdOf } from './world-area';

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
  /** The lights of the hidden tokens this viewer does not receive (absent: none). */
  veiledLights?: readonly VeiledLightDto[];
  /** Where dragged tokens would land: their lights tint from there, like the fog. */
  landing: TokenLanding;
}>;

// A change that leaves the colored lights and the walls alone hands back the last tint whole.
let lastTint: LightTintView | null = null;

/** The tint of the colored lights, or `null` with nothing to tint: a light only counts in the
 *  dark, so daylight and sight off tint nothing, and neutral or unlit lights never do. The same
 *  for every viewer; the fog above it hides what a player does not see. The key comes first (the
 *  lights placed, the walls by identity): the same key gives back the very same view.
 *
 *  Example: `lightTintViewOf({ scene, walls, lights, tokens, landing: new Map() })?.tints.length` */
export function lightTintViewOf(input: LightTintInput): LightTintView | null {
  const { scene } = input;
  if (scene.vision !== 'dark') return null;
  const size = { widthCells: scene.widthCells, heightCells: scene.heightCells };
  const walls = gameWallsOf(input.walls);
  const colored = shiningLightsOf(input, input.landing).flatMap(({ source, color }) => {
    const hex = lightColorHex(color);
    return hex === null ? [] : [{ color: hex, source }];
  });
  if (colored.length === 0) return null;
  const lights = colored.map(({ color, source }) => [
    color,
    source.center,
    source.range,
    source.cone,
  ]);
  const key = JSON.stringify([size, wallSetIdOf(walls), lights]);
  if (lastTint?.key === key) return lastTint;
  lastTint = {
    width: size.widthCells * CELL_WORLD_SIZE,
    height: size.heightCells * CELL_WORLD_SIZE,
    tints: colored.map(({ color, source }) => ({ color, ...lightAreasOf(source, walls, size) })),
    key,
  };
  return lastTint;
}
