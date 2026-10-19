import type { BoardStateDto, TokenDto } from '@lorkarium/contracts';
import {
  doorSeenBy,
  eyeOf,
  sightLevel,
  sightRange,
  tokenCenter,
  type Eye,
  type SightContext,
  type SightLevel,
  type SightMode,
  type Wall,
} from '@lorkarium/game-core';
import { lightSourcesOf, type TokenLanding } from './light-sources';
import { gameWallOf } from './wall-geometry';

/** What this viewer sees of the board: the level of each token, the eyes it looks through and the
 *  doors they see. `active` is false when nothing is hidden (sight off, or the master not
 *  previewing): then every token is seen and every door shows (`seenDoorIds: null`). */
export type BoardSight = Readonly<{
  active: boolean;
  mode: SightMode;
  /** Only the tokens that are not seen are listed; a missing id is seen. */
  levels: ReadonlyMap<string, SightLevel>;
  eyes: readonly Eye[];
  /** The tokens whose eyes look: the viewer's own (or the master's preview). */
  eyeTokenIds: readonly string[];
  /** Dark, and the viewer controls no token on the scene: nothing but darkness shows. */
  noEyes: boolean;
  seenDoorIds: ReadonlySet<string> | null;
  /** The master previews with no token selected: nothing is hidden, and the room says so. */
  previewBlind: boolean;
}>;

export type BoardSightOptions = Readonly<{
  /** The master's "Ver como os selecionados": these tokens are the eyes; `null` = off. */
  previewEyeIds: readonly string[] | null;
  /** Where the dragged tokens of this viewer would land: their eyes look from there. */
  landing?: TokenLanding;
}>;

const ALL_SEEN = new Map<string, SightLevel>();

/** The filter every view of the board goes through for this viewer: a player sees by every token
 *  they control (darkvision or not) whatever is in its range or lit, the master sees everything
 *  unless previewing the selected tokens. The rule is the game-core's (`sightLevel`, `doorSeenBy`,
 *  with `lightSourcesOf`), the same the server uses for doors.
 *
 *  Example: `const sight = boardSightOf(board, { previewEyeIds: null }); levelOf(sight, ogreId)` */
export function boardSightOf(board: BoardStateDto, options: BoardSightOptions): BoardSight {
  const mode = board.scene.vision;
  const watching = watchersOf(board, options.previewEyeIds);
  if (mode === 'off' || !watching) return clearSight(mode);
  const eyeTokens = board.tokens.filter(({ id }) => watching.includes(id));
  const eyes = eyeTokens.map((token) => eyeOfToken(token, options.landing));
  if (options.previewEyeIds && eyes.length === 0)
    return { ...clearSight(mode), previewBlind: true };
  const walls = board.walls.map(gameWallOf);
  const lights = lightSourcesOf(board, options.landing);
  const context: SightContext = { eyes, walls, mode, lights };
  return {
    active: true,
    mode,
    levels: levelsOf(board.tokens, watching, context),
    eyes,
    eyeTokenIds: watching,
    noEyes: mode === 'dark' && eyes.length === 0,
    seenDoorIds: doorsSeen(board, walls, context),
    previewBlind: false,
  };
}

/** How this viewer sees one token (a token not listed is seen).
 *
 *  Example: `levelOf(sight, token.id) === 'silhouette'` */
export function levelOf(sight: BoardSight, tokenId: string): SightLevel {
  return sight.levels.get(tokenId) ?? 'seen';
}

/** The tokens this viewer sees whole: what the lists, the keys and the menus may name.
 *
 *  Example: `seenTokensOf(board, sight).map(({ name }) => name)` */
export function seenTokensOf(
  board: Readonly<{ tokens: readonly TokenDto[] }>,
  sight: BoardSight,
): TokenDto[] {
  return board.tokens.filter(({ id }) => levelOf(sight, id) === 'seen');
}

// A player looks through the tokens they control; the master only while previewing.
function watchersOf(
  board: BoardStateDto,
  previewEyeIds: readonly string[] | null,
): string[] | null {
  if (previewEyeIds) return [...previewEyeIds];
  if (board.viewer.role === 'master') return null;
  return board.tokens.filter(({ canControl }) => canControl).map(({ id }) => id);
}

function eyeOfToken(token: TokenDto, landing: BoardSightOptions['landing']): Eye {
  const at = landing?.get(token.id) ?? token;
  const range = token.sight ? sightRange(token.sight.bright, token.sight.dim) : null;
  return eyeOf(tokenCenter(at, token), range);
}

function levelsOf(
  tokens: readonly TokenDto[],
  watching: readonly string[],
  context: SightContext,
): Map<string, SightLevel> {
  const levels = new Map<string, SightLevel>();
  for (const token of tokens) {
    if (watching.includes(token.id)) continue;
    const box = { x: token.col, y: token.row, width: token.width, height: token.height };
    const level = sightLevel(context, { box, scenery: token.layer === 'background' });
    if (level !== 'seen') levels.set(token.id, level);
  }
  return levels;
}

// The door handed to the rule is the very wall of `walls`: it never hides itself.
function doorsSeen(
  board: BoardStateDto,
  walls: readonly Wall[],
  context: SightContext,
): Set<string> {
  const seen = new Set<string>();
  board.walls.forEach((dto, index) => {
    const door = walls[index];
    if (dto.kind === 'door' && door && doorSeenBy(context, door)) seen.add(dto.id);
  });
  return seen;
}

function clearSight(mode: SightMode): BoardSight {
  return {
    active: false,
    mode,
    levels: ALL_SEEN,
    eyes: [],
    eyeTokenIds: [],
    noEyes: false,
    seenDoorIds: null,
    previewBlind: false,
  };
}
