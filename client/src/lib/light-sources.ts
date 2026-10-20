import type { LightDto, TokenDto } from '@lorkarium/contracts';
import { lightRange, lightSource, tokenCenter, type LightSource } from '@lorkarium/game-core';
import type { LightColor } from './light-color';

/** Where dragged tokens would land, by id: their eyes and lights follow them before the move. */
export type TokenLanding = ReadonlyMap<string, Readonly<{ col: number; row: number }>>;

/** A light shining on the board and the color it tints with (`null` = neutral). */
export type ShiningLight = Readonly<{ source: LightSource; color: LightColor }>;

type LitBoard = Readonly<{ lights: readonly LightDto[]; tokens: readonly TokenDto[] }>;

/** Every light shining on the board: the lit map lights and the lit lights of every token (of
 *  anyone, seen or not — the glow around the corner still lights what the viewer sees), a dragged
 *  token's from the cell where it would land. The same list the sight filter and the fog use.
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
  const mapLights = board.lights.map(({ x, y, bright, dim, lit, color }) =>
    shiningOf(lightSource({ x, y }, lightRange(bright, dim), lit), color),
  );
  const tokenLights = board.tokens.map((token) => tokenLightOf(token, landing));
  return [...mapLights, ...tokenLights].filter((light) => light !== null);
}

function tokenLightOf(token: TokenDto, landing: TokenLanding | undefined): ShiningLight | null {
  if (!token.light) return null;
  const at = landing?.get(token.id) ?? token;
  const range = lightRange(token.light.bright, token.light.dim);
  return shiningOf(lightSource(tokenCenter(at, token), range, token.lightLit), token.light.color);
}

function shiningOf(source: LightSource | null, color: LightColor): ShiningLight | null {
  return source && { source, color };
}
