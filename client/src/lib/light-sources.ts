import type { LightDto, TokenDto } from '@lorkarium/contracts';
import {
  coneOf,
  lightRange,
  lightSource,
  tokenCenter,
  type LightSource,
} from '@lorkarium/game-core';
import type { LightColor } from './light-color';

/** Where a token shows and where it looks: its eye and its lantern follow the pose. */
export type TokenPose = Readonly<{ col: number; row: number; facing: number }>;
/** Where tokens show off their confirmed pose, by id (dragged, waiting for the server, turned):
 *  their eyes and lights follow them before the move or the turn is confirmed. */
export type TokenLanding = ReadonlyMap<string, TokenPose>;

/** A light shining on the board and the color it tints with (`null` = neutral). */
export type ShiningLight = Readonly<{ source: LightSource; color: LightColor }>;

type LitBoard = Readonly<{ lights: readonly LightDto[]; tokens: readonly TokenDto[] }>;

/** Every light shining on the board: the lit map lights and the lit lights of every token (of
 *  anyone, seen or not — the glow around the corner still lights what the viewer sees), a dragged
 *  or turned token's from the pose where it shows; a lantern or a spotlight shines in its cone. The same list the sight filter and the fog use.
 *
 *  Example: `sightLevel({ eyes, walls, mode, lights: lightSourcesOf(board, landing) }, target)` */
export function lightSourcesOf(board: LitBoard, landing?: TokenLanding): LightSource[] {
  return shiningLightsOf(board, landing).map(({ source }) => source);
}

/** The lights of `lightSourcesOf`, each with its color: the map lights in creation order, then
 *  the tokens. What the tint of the board paints.
 *
 *  Example: `shiningLightsOf(board, landing).filter(({ color }) => color !== null)` */
export function shiningLightsOf(board: LitBoard, landing?: TokenLanding): ShiningLight[] {
  const mapLights = board.lights.map(({ x, y, bright, dim, lit, color, facing, angle }) =>
    shiningOf(lightSource({ x, y }, lightRange(bright, dim), lit, coneOf(facing, angle)), color),
  );
  const tokenLights = board.tokens.map((token) => tokenLightOf(token, landing));
  return [...mapLights, ...tokenLights].filter((light) => light !== null);
}

function tokenLightOf(token: TokenDto, landing: TokenLanding | undefined): ShiningLight | null {
  if (!token.light) return null;
  const at = landing?.get(token.id) ?? token;
  const range = lightRange(token.light.bright, token.light.dim);
  const cone = coneOf(at.facing, token.light.angle);
  const source = lightSource(tokenCenter(at, token), range, token.lightLit, cone);
  return shiningOf(source, token.light.color);
}

function shiningOf(source: LightSource | null, color: LightColor): ShiningLight | null {
  return source && { source, color };
}
