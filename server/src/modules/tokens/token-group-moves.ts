import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { LockedGrid } from '../scenes/locked-scene';
import type { ScenePo } from '../scenes/scenes.po';
import type { SceneWallsService } from '../walls/scene-walls.service';
import { TokenAccessBo } from './token-access.bo';
import { TokenRulesBo } from './token-rules.bo';
import { tokenAccessOf, tokensIn, type TokenWriteDaos } from './token-transaction';
import type { DragGroupPo, TokenMovePo, TokenRow } from './tokens.dao';
import { TokenNotFoundError } from './tokens.error';

/** `BAR_VALUE_LIMIT` and `TOKENS_PER_SCENE_MAX`, handed to the rule. */
export type TokenLimits = Readonly<{ barLimit: number; tokenLimit: number }>;

/** Where one token of a group goes: a cell to fit, or `null` (a drag that only lifts it). */
export type GroupCell = Readonly<{
  tokenId: string;
  cell: Readonly<{ col: number; row: number }> | null;
}>;

type CellAt = Readonly<{ col: number; row: number }>;

/** One token's way across the scene: from where it stands, by its bends, to `to`. */
export type TokenPassage = Readonly<{
  row: TokenRow;
  path: readonly CellAt[] | undefined;
  to: CellAt;
}>;

type Locked = LockedGrid<TokenWriteDaos>;

/** The rule of the tokens on one scene, with the table's members (the allowed controllers).
 *
 *  Example: `tokenRulesOf(scene, memberIds, limits).place(command, found.token)` */
export function tokenRulesOf(
  scene: Pick<ScenePo, 'widthCells' | 'heightCells'>,
  memberIds: readonly string[],
  { barLimit, tokenLimit }: TokenLimits,
): TokenRulesBo {
  const sceneSize = { widthCells: scene.widthCells, heightCells: scene.heightCells };
  return new TokenRulesBo({ scene: sceneSize, memberIds, barLimit, tokenLimit });
}

/** Every token of a group found, movable by the requester and fitting where it goes, before any
 *  write; the rows come back in the order of the cells.
 *
 *  Example: `const rows = await placedGroupOf(locked, access, cells, 'move', limits)` */
export async function placedGroupOf(
  { daos, scene }: Locked,
  access: CampaignAccessBo,
  cells: readonly GroupCell[],
  action: 'move' | 'drag',
  limits: TokenLimits,
): Promise<TokenRow[]> {
  const tokenIds = cells.map(({ tokenId }) => tokenId);
  const rows = await tokensIn(daos, scene, access.campaignIdOf(), tokenIds);
  const rules = tokenRulesOf(scene, [], limits);
  rows.forEach((row, index) => {
    tokenAccessOf(access, row).requireMove(action, row.token.layer);
    const cell = cells[index]?.cell;
    if (cell) rules.place(cell, row.token);
  });
  return rows;
}

/** The checks of `placedGroupOf`, over what the drag query found (no transaction).
 *
 *  Example: `requireDrags(access, scene, group.tokens, command.drags, limits)` */
export function requireDrags(
  access: CampaignAccessBo,
  scene: DragGroupPo['scene'],
  dragged: DragGroupPo['tokens'],
  drags: readonly GroupCell[],
  limits: TokenLimits,
): void {
  const byId = new Map(dragged.map((each) => [each.token.id, each]));
  const rules = tokenRulesOf(scene, [], limits);
  for (const { tokenId, cell } of drags) {
    const found = byId.get(tokenId);
    if (!found) throw new TokenNotFoundError(access.campaignIdOf(), tokenId);
    const { controllerIds } = found;
    new TokenAccessBo(access, { tokenId, controllerIds }).requireMove('drag', found.token.layer);
    if (cell) rules.place(cell, found.token);
  }
}

/** The master passes every wall; a player's token walks its path center to center (spec §5.4).
 *
 *  Example: `await requirePassages(locked, access, passages, { walls: sceneWalls, limits })` */
export async function requirePassages(
  { daos, scene }: Locked,
  access: CampaignAccessBo,
  passages: readonly TokenPassage[],
  deps: Readonly<{ walls: Pick<SceneWallsService, 'wallsOf'>; limits: TokenLimits }>,
): Promise<void> {
  const walking = passages.filter(({ row }) => !tokenAccessOf(access, row).ignoresWalls());
  if (walking.length === 0) return;
  const walls = await deps.walls.wallsOf(scene.id, daos.walls);
  const rules = tokenRulesOf(scene, [], deps.limits);
  for (const { row, path, to } of walking) {
    rules.requirePassage(row.token.id, [row.token, ...(path ?? []), to], row.token, walls);
  }
}

/** Who controls a dragged token, as the veil of the preview needs it.
 *
 *  Example: `controlVeilOf(group.tokens.map(controlOfDragged))` */
export function controlOfDragged({
  token,
  controllerIds,
}: DragGroupPo['tokens'][number]): Readonly<{
  tokenId: string;
  controllerIds: readonly string[];
  hidden: boolean;
}> {
  return { tokenId: token.id, controllerIds, hidden: token.hidden };
}

/** The rows as the moves left them (the veil's lights shine from where the tokens now are).
 *
 *  Example: `veiledWriteOf(daos, scene.id, movedRowsOf(rows, moves))` */
export function movedRowsOf(rows: readonly TokenRow[], moves: readonly TokenMovePo[]): TokenRow[] {
  const byId = new Map(moves.map((move) => [move.tokenId, move]));
  return rows.map((row) => {
    const move = byId.get(row.token.id);
    return move ? { ...row, token: { ...row.token, col: move.col, row: move.row } } : row;
  });
}
