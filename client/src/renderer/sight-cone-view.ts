import type { SceneDto, TokenDto, WallDto } from '@lorkarium/contracts';
import { eyeFieldOf, tokenCenter } from '@lorkarium/game-core';
import type { TokenLanding } from '@/lib/light-sources';
import { gameWallsOf } from '@/lib/wall-geometry';
import type { Point } from './camera';
import { wallSetIdOf, worldAreaOf } from './world-area';

/** The outline of the field of view of the token the master selected alone: its cone and ring up
 *  to its darkvision in the dark (the scene border by daylight or without darkvision), cut by the
 *  walls, in world px. `key` changes only when any of it does. */
export type SightConeView = Readonly<{ outline: readonly Point[]; key: string }>;

export type SightConeInput = Readonly<{
  viewer: Readonly<{ isMaster: boolean }>;
  scene: SceneDto;
  tokens: readonly TokenDto[];
  walls: readonly WallDto[];
  selectedTokenIds: readonly string[];
  /** Where tokens show and look (dragged, turned by the handle): the outline follows the pose. */
  landing: TokenLanding;
}>;

// The same selection in the same pose hands back the last outline whole.
let lastCone: SightConeView | null = null;

/** The outline the master sees of a field of view: only for the master (a player sees their field
 *  in the fog), only with one token selected that looks in a cone (below 360°), only in a scene
 *  Escuro or Luz do dia; `null` otherwise.
 *
 *  Example: `sightConeViewOf({ viewer, scene, tokens, walls, selectedTokenIds, landing })?.outline` */
export function sightConeViewOf(input: SightConeInput): SightConeView | null {
  const token = outlinedTokenOf(input);
  if (!token) return null;
  const at = input.landing.get(token.id) ?? token;
  const footprint = { x: at.col, y: at.row, width: token.width, height: token.height };
  const field = eyeFieldOf(footprint, at.facing, token.sightAngle);
  if (!field) return null;
  const { scene } = input;
  const size = { widthCells: scene.widthCells, heightCells: scene.heightCells };
  const center = tokenCenter(at, token);
  const walls = gameWallsOf(input.walls);
  const reach = outlineReachOf(token, scene.vision);
  const key = JSON.stringify([size, center, field, reach, wallSetIdOf(walls)]);
  if (lastCone?.key === key) return lastCone;
  lastCone = { outline: worldAreaOf(center, walls, size, reach, field), key };
  return lastCone;
}

// In the dark the field ends where darkvision does (bright + dim); by daylight, and for a token
// without darkvision (it sees what is lit at any distance), it goes to the scene border.
function outlineReachOf(token: TokenDto, vision: SceneDto['vision']): number {
  if (vision !== 'dark' || !token.sight) return Number.POSITIVE_INFINITY;
  return token.sight.bright + token.sight.dim;
}

function outlinedTokenOf(input: SightConeInput): TokenDto | null {
  if (!input.viewer.isMaster || input.scene.vision === 'off') return null;
  if (input.selectedTokenIds.length !== 1) return null;
  const token = input.tokens.find(({ id }) => id === input.selectedTokenIds[0]);
  return token && token.sightAngle < 360 ? token : null;
}
