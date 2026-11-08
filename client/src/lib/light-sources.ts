import type { LightDto, TokenDto, VeiledLightDto } from '@lorkarium/contracts';
import {
  coneOf,
  lightRange,
  lightSource,
  tokenCenter,
  type LightSource,
  type SightBlocker,
} from '@lorkarium/game-core';
import type { LightColor } from './light-color';
import { NO_BLOCKERS, blockerIgnoresOf } from './sight-geometry';

/** Where a token shows and where it looks: its eye and its lantern follow the pose. */
export type TokenPose = Readonly<{ col: number; row: number; facing: number }>;
/** Where tokens show off their confirmed pose, by id (dragged, waiting for the server, turned):
 *  their eyes and lights follow them before the move or the turn is confirmed. */
export type TokenLanding = ReadonlyMap<string, TokenPose>;

/** A light shining on the board and the color it tints with (`null` = neutral). */
export type ShiningLight = Readonly<{ source: LightSource; color: LightColor }>;

type LitBoard = Readonly<{
  lights: readonly LightDto[];
  tokens: readonly TokenDto[];
  /** The lit lights of the hidden tokens this viewer does not receive (absent: none). */
  veiledLights?: readonly VeiledLightDto[];
}>;

const NO_VEILED_LIGHTS: readonly VeiledLightDto[] = [];

/** Every light shining on the board: the lit map lights, the lit lights of every token (of
 *  anyone, seen or not — the glow around the corner still lights what the viewer sees) and the
 *  veiled lights of the hidden tokens this viewer never receives, a dragged
 *  or turned token's from the pose where it shows; a lantern or a spotlight shines in its cone. Each
 *  gets out of the `blockers` it stands inside (a token's, of itself too). The same list the sight
 *  filter and the fog use.
 *
 *  Example: `sightLevel({ eyes, walls, mode, lights: lightSourcesOf(board, landing) }, target)` */
export function lightSourcesOf(
  board: LitBoard,
  landing?: TokenLanding,
  blockers: readonly SightBlocker[] = NO_BLOCKERS,
): LightSource[] {
  return shiningLightsOf(board, landing, blockers).map(({ source }) => source);
}

/** The lights of `lightSourcesOf`, each with its color: the map lights in creation order, then
 *  the tokens, then the veiled lights of the hidden tokens (always lit, from the center the
 *  server sent). What the tint of the board paints.
 *
 *  Example: `shiningLightsOf(board, landing).filter(({ color }) => color !== null)` */
export function shiningLightsOf(
  board: LitBoard,
  landing?: TokenLanding,
  blockers: readonly SightBlocker[] = NO_BLOCKERS,
): ShiningLight[] {
  const mapLights = board.lights.map((light) => mapLightOf(light, blockers));
  const tokenLights = board.tokens.map((token) => tokenLightOf(token, landing, blockers));
  const veiled = (board.veiledLights ?? NO_VEILED_LIGHTS).map((light) =>
    veiledLightOf(light, blockers),
  );
  return [...mapLights, ...tokenLights, ...veiled].filter((light) => light !== null);
}

function mapLightOf(light: LightDto, blockers: readonly SightBlocker[]): ShiningLight | null {
  const { x, y, bright, dim, lit, color, facing, angle } = light;
  const point = { x, y };
  const ignores = blockerIgnoresOf(blockers, point);
  const source = lightSource(point, lightRange(bright, dim), lit, coneOf(facing, angle), ignores);
  return shiningOf(source, color);
}

// The server only sends the lit ones, already placed: it never says which token shines.
function veiledLightOf(
  light: VeiledLightDto,
  blockers: readonly SightBlocker[],
): ShiningLight | null {
  const { x, y, bright, dim, facing, angle, color } = light;
  const point = { x, y };
  const ignores = blockerIgnoresOf(blockers, point);
  const source = lightSource(point, lightRange(bright, dim), true, coneOf(facing, angle), ignores);
  return shiningOf(source, color);
}

function tokenLightOf(
  token: TokenDto,
  landing: TokenLanding | undefined,
  blockers: readonly SightBlocker[],
): ShiningLight | null {
  if (!token.light) return null;
  const at = landing?.get(token.id) ?? token;
  const range = lightRange(token.light.bright, token.light.dim);
  const cone = coneOf(at.facing, token.light.angle);
  const center = tokenCenter(at, token);
  const ignores = blockerIgnoresOf(blockers, center, token.id);
  return shiningOf(lightSource(center, range, token.lightLit, cone, ignores), token.light.color);
}

function shiningOf(source: LightSource | null, color: LightColor): ShiningLight | null {
  return source && { source, color };
}
