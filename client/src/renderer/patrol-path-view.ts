import type { TokenDto, TokenPatrolRepeatDto } from '@lorkarium/contracts';
import { cell, type Cell } from '@lorkarium/game-core';
import type { PatrolPoses } from '@/lib/patrol-poses';
import { CELL_WORLD_SIZE, type Point } from './camera';

/** One leg of a patrol route in world px, center to center; `closing` is the loop's way back
 *  from the last point to the first (drawn dashed). */
export type PatrolPathLeg = Readonly<{ from: Point; to: Point; closing: boolean }>;

/** The master's line of one token's patrol: its legs, a mark on each point, where the patrol is
 *  now (`null`: it is not running), whether it is the editor's draft, and the token's size (a
 *  click of the editor lands the token centered on it). */
export type PatrolPathView = Readonly<{
  legs: readonly PatrolPathLeg[];
  points: readonly Point[];
  here: Point | null;
  draft: boolean;
  size: Readonly<{ width: number; height: number }>;
}>;

/** What the line is drawn from: the route as token origins, what it does at the end, the size of
 *  the token and where it walks now (absent: nowhere, it is paused or a draft). */
export type PatrolPathInput = Readonly<{
  path: readonly Cell[];
  repeat: TokenPatrolRepeatDto;
  size: Readonly<{ width: number; height: number }>;
  here?: Cell | null;
  draft: boolean;
}>;

/** The line through the centers of the token at each point: a loop closes back to the first
 *  point, a bounce does not (it walks the same legs back).
 *
 *  Example: `patrolPathViewOf({ path, repeat: 'loop', size: { width: 1, height: 1 }, draft: false }).legs.length` */
export function patrolPathViewOf(input: PatrolPathInput): PatrolPathView {
  const points = input.path.map((point) => centerOf(point, input.size));
  const legs = points.slice(1).map((to, index) => legOf(points[index], to, false));
  const [first] = points;
  const last = points.at(-1);
  const closes = input.repeat === 'loop' && points.length > 2 && first && last;
  if (closes) legs.push(legOf(last, first, true));
  const here = input.here ? centerOf(input.here, input.size) : null;
  return { legs, points, here, draft: input.draft, size: input.size };
}

function legOf(from: Point | undefined, to: Point, closing: boolean): PatrolPathLeg {
  return { from: from ?? to, to, closing };
}

function centerOf({ col, row }: Cell, { width, height }: PatrolPathInput['size']): Point {
  return { x: (col + width / 2) * CELL_WORLD_SIZE, y: (row + height / 2) * CELL_WORLD_SIZE };
}

/** The route the editor is drawing, over the token it starts from. */
export type PatrolDraftView = Readonly<{
  tokenId: string;
  path: readonly Cell[];
  repeat: TokenPatrolRepeatDto;
}>;

/** What the board reads to pick the line: only the master sees one, of the draft being drawn or
 *  else of the token selected alone, when it has a patrol. */
export type BoardPatrolPathInput = Readonly<{
  viewer: Readonly<{ isMaster: boolean }>;
  tokens: readonly TokenDto[];
  selectedTokenIds: readonly string[];
  patrols?: PatrolPoses;
  patrolDraft?: PatrolDraftView | null;
}>;

/** The patrol line of the board, or `null`: a player or a spectator never gets one (the route
 *  is the master's tool), nor a selection of two tokens or of one with no patrol. The draft wins
 *  over the saved route.
 *
 *  Example: `boardPatrolPathOf({ viewer, tokens, selectedTokenIds: [kaelId], patrols })?.legs` */
export function boardPatrolPathOf(input: BoardPatrolPathInput): PatrolPathView | null {
  if (!input.viewer.isMaster) return null;
  const { patrolDraft } = input;
  if (patrolDraft) return draftPathOf(input.tokens, patrolDraft);
  const [only, ...others] = input.selectedTokenIds;
  const token = others.length === 0 ? input.tokens.find(({ id }) => id === only) : undefined;
  if (!token?.patrol) return null;
  const path = token.patrol.path.map(([col, row]) => cell(col, row));
  const here = input.patrols?.get(token.id) ?? null;
  const { repeat } = token.patrol;
  return patrolPathViewOf({ path, repeat, size: token, here, draft: false });
}

function draftPathOf(tokens: readonly TokenDto[], draft: PatrolDraftView): PatrolPathView | null {
  const token = tokens.find(({ id }) => id === draft.tokenId);
  if (!token) return null;
  const { path, repeat } = draft;
  return patrolPathViewOf({ path, repeat, size: token, draft: true });
}
