import type { TokenDto, WallDto } from '@lorkarium/contracts';
import {
  blockersIgnoredAt,
  sightBlockerOf,
  type SceneSize,
  type SightBlocker,
  type SightBlockerToken,
  type SightOutline,
  type Vector2,
  type Wall,
} from '@lorkarium/game-core';
import type { TokenLanding } from './light-sources';
import { gameWallsOf } from './wall-geometry';

/** The outlines known so far, by asset. No entry = not known yet; `null` = the image has none (or
 *  the request failed); both block by the rectangle. */
export type SightOutlines = ReadonlyMap<string, SightOutline | null>;

/** The one list of sight walls: the scene's first, then those of the blockers, the very instances
 *  of `blockers[i].walls` (the game-core leaves them out by reference). */
export type SightGeometry = Readonly<{
  walls: readonly Wall[];
  blockers: readonly SightBlocker[];
}>;

export type SightGeometryBoard = Readonly<{
  scene: SceneSize;
  tokens: readonly TokenDto[];
  walls: readonly WallDto[];
}>;

type Remembered = Readonly<{ shapeKey: string; geometry: SightGeometry }>;
type BlockerShape = SightBlockerToken & Readonly<{ assetId: string | null }>;

/** No outline known: every blocker by its rectangle or disc. One constant, so that a caller with
 *  none does not hand a new map at every call. */
export const NO_SIGHT_OUTLINES: SightOutlines = new Map();

/** No token blocks. */
export const NO_BLOCKERS: readonly SightBlocker[] = Object.freeze([]);

const NO_IGNORES: readonly Wall[] = Object.freeze([]);

const REMEMBERED_IGNORES_MAX = 1024;

// By the array of real walls, so the shown grid and the group grid, read in turns by the same
// render, do not push each other out.
const remembered = new WeakMap<readonly WallDto[], Remembered>();
const rememberedIgnores = new WeakMap<readonly SightBlocker[], Map<string, readonly Wall[]>>();
const rememberedBlockerTokens = new WeakMap<readonly TokenDto[], readonly TokenDto[]>();

/** The walls that cut sight on a board and the blockers among them, by the pose each token shows
 *  and the outlines known. Every memory of sight is keyed by these identities: the same geometry
 *  (and its `walls` and `blockers`) comes back while the real walls and the shape of the blockers
 *  stay; another token moving changes nothing. With no blocker, `walls` is `gameWallsOf(board.walls)`
 *  itself. Passage (`blockedPassage`, the drag's route) stays on `gameWallsOf`: a blocker bars no one.
 *
 *  Example: `const { walls, blockers } = sightGeometryOf(board, outlines, landing)` */
export function sightGeometryOf(
  board: SightGeometryBoard,
  outlines: SightOutlines,
  landing?: TokenLanding,
): SightGeometry {
  const shapes = blockerTokensOf(board.tokens).map((token) => shapeOf(token, outlines, landing));
  const shapeKey = shapeKeyOf(shapes, board.scene);
  const last = remembered.get(board.walls);
  if (last?.shapeKey === shapeKey) return last.geometry;
  const geometry = geometryOf(board, shapes);
  remembered.set(board.walls, { shapeKey, geometry });
  return geometry;
}

/** The geometry of a board with no blocker to read: its real walls, by identity.
 *
 *  Example: `input.geometry ?? wallsOnlyGeometryOf(input.walls)` */
export function wallsOnlyGeometryOf(walls: readonly WallDto[]): SightGeometry {
  return { walls: gameWallsOf(walls), blockers: NO_BLOCKERS };
}

/** `blockersIgnoredAt`, the very same list for the same blockers, point and token. Standing on two
 *  blockers makes a list of its own, and the keys of the fog hold lists by identity: a new one at
 *  every build would redo the fog at every change of the ruler. It also keeps 86 points × 50
 *  blockers × 48 vertices out of the path of the ruler.
 *
 *  Example: `eyeOf(center, range, field, blockerIgnoresOf(blockers, center, token.id))` */
export function blockerIgnoresOf(
  blockers: readonly SightBlocker[],
  point: Vector2,
  ownId: string | null = null,
): readonly Wall[] {
  if (blockers.length === 0) return NO_IGNORES;
  const known = ignoresMemoryOf(blockers);
  const key = `${point.x},${point.y},${ownId}`;
  const hit = known.get(key);
  if (hit) return hit;
  const ignored = blockersIgnoredAt(point, blockers, ownId);
  if (known.size >= REMEMBERED_IGNORES_MAX) known.clear();
  known.set(key, ignored);
  return ignored;
}

function ignoresMemoryOf(blockers: readonly SightBlocker[]): Map<string, readonly Wall[]> {
  const known = rememberedIgnores.get(blockers);
  if (known) return known;
  const fresh = new Map<string, readonly Wall[]>();
  rememberedIgnores.set(blockers, fresh);
  return fresh;
}

/** Whether this token cuts sight now: a hidden one does not, or it would give its place away.
 *
 *  Example: `board.tokens.filter(blocksSightNow)` */
function blocksSightNow(token: TokenDto): boolean {
  return token.blocksSight && !token.hidden;
}

/** The tokens of this array that cut sight now, swept once per array: a change of the ruler or a
 *  drag asks several times per build and keeps the array, and a table with no blocker pays only
 *  this one sweep.
 *
 *  Example: `blockerTokensOf(board.tokens).length === 0` */
export function blockerTokensOf(tokens: readonly TokenDto[]): readonly TokenDto[] {
  const known = rememberedBlockerTokens.get(tokens);
  if (known) return known;
  const swept = tokens.filter(blocksSightNow);
  rememberedBlockerTokens.set(tokens, swept);
  return swept;
}

/** The images whose outline a board needs: those of its blockers on the square frame (the round one
 *  blocks by the disc), each once.
 *
 *  Example: `void outlines.getState().request(blockerAssetIdsOf(board.tokens))` */
export function blockerAssetIdsOf(tokens: readonly TokenDto[]): readonly string[] {
  const ids = new Set<string>();
  for (const token of tokens) {
    if (blocksSightNow(token) && token.frame === 'square' && token.imageAssetId) {
      ids.add(token.imageAssetId);
    }
  }
  return [...ids];
}

function shapeOf(
  token: TokenDto,
  outlines: SightOutlines,
  landing: TokenLanding | undefined,
): BlockerShape {
  const { id, width, height, frame, flipX, flipY, imageAssetId: assetId } = token;
  const { col, row, facing } = landing?.get(id) ?? token;
  return {
    tokenId: id,
    box: { x: col, y: row, width, height },
    frame,
    hasImage: assetId !== null,
    outline: outlineShapingOf(token, outlines),
    facing,
    flipX,
    flipY,
    assetId,
  };
}

// An empty outline and no outline give the same rectangle, and the round frame reads neither.
function outlineShapingOf(token: TokenDto, outlines: SightOutlines): SightOutline | null {
  if (token.frame !== 'square' || !token.imageAssetId) return null;
  const outline = outlines.get(token.imageAssetId);
  return outline?.length ? outline : null;
}

// The asset stands for its outline: an asset's outline never changes, and writing out 48 vertices
// per blocker on every read would cost more than the rebuild it saves.
function shapeKeyOf(shapes: readonly BlockerShape[], scene: SceneSize): string {
  if (shapes.length === 0) return '';
  const parts = shapes.map((shape) => {
    const { tokenId, box, frame, hasImage, facing, flipX, flipY, outline, assetId } = shape;
    const turned = hasImage ? facing : 'still';
    const traced = outline ? assetId : 'none';
    return [tokenId, box.x, box.y, box.width, box.height, frame, turned, flipX, flipY, traced];
  });
  return `${scene.widthCells}x${scene.heightCells}:${parts.join(';')}`;
}

function geometryOf(board: SightGeometryBoard, shapes: readonly BlockerShape[]): SightGeometry {
  const real = gameWallsOf(board.walls);
  if (shapes.length === 0) return { walls: real, blockers: NO_BLOCKERS };
  const blockers = shapes.map((shape) => sightBlockerOf(shape, board.scene));
  return { walls: [...real, ...blockers.flatMap(({ walls }) => walls)], blockers };
}
