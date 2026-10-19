import type { LightDto, TokenDto } from '@lorkarium/contracts';
import { lightRange, lightSource, tokenCenter, type LightSource } from '@lorkarium/game-core';

/** Where dragged tokens would land, by id: their eyes and lights follow them before the move. */
export type TokenLanding = ReadonlyMap<string, Readonly<{ col: number; row: number }>>;

/** Every light shining on the board: the lit map lights and the lit lights of every token (of
 *  anyone, seen or not — the glow around the corner still lights what the viewer sees), a dragged
 *  token's from the cell where it would land. The same list the sight filter and the fog use.
 *
 *  Example: `sightLevel({ eyes, walls, mode, lights: lightSourcesOf(board, landing) }, target)` */
export function lightSourcesOf(
  board: Readonly<{ lights: readonly LightDto[]; tokens: readonly TokenDto[] }>,
  landing?: TokenLanding,
): LightSource[] {
  const mapLights = board.lights.map(({ x, y, bright, dim, lit }) =>
    lightSource({ x, y }, lightRange(bright, dim), lit),
  );
  const tokenLights = board.tokens.map((token) => tokenLightOf(token, landing));
  return [...mapLights, ...tokenLights].filter((light) => light !== null);
}

function tokenLightOf(token: TokenDto, landing: TokenLanding | undefined): LightSource | null {
  if (!token.light) return null;
  const at = landing?.get(token.id) ?? token;
  const range = lightRange(token.light.bright, token.light.dim);
  return lightSource(tokenCenter(at, token), range, token.lightLit);
}
