import { and, count, eq, inArray, isNotNull, sql, type SQL } from 'drizzle-orm';
import { copyRowsSql } from '../../database/copy-rows';
import type { DatabaseExecutor } from '../../database/transaction';
import { updateManySql } from '../../database/update-many';
import { tokenPatrols, type TokenPatrolPo } from './token-patrols.po';
import { tokens, type TokenPo } from './tokens.po';

/** A token as a patrol needs it: where it stands, its size and its patrol (`null` = none). */
export type PatrolledTokenPo = Readonly<{
  token: Pick<TokenPo, 'id' | 'col' | 'row' | 'facing' | 'width' | 'height' | 'hidden'>;
  patrol: TokenPatrolPo | null;
}>;

/** Where one token stands and looks. */
export type TokenPosePo = Readonly<{ tokenId: string; col: number; row: number; facing: number }>;

/** Where a pause leaves one token: its pose and the cycle step it resumes from. */
export type PatrolPausePo = TokenPosePo & Readonly<{ step: number }>;

// The patrol as `json_build_object` hands it: the numeric as text, the instant as an ISO string.
type PatrolJson = Omit<TokenPatrolPo, 'startedAt'> & Readonly<{ startedAt: string | null }>;

/** The patrol of a token as a column of a select from `tokens` (`null` without one), read in the
 *  same query as the token. Spelled out with the table names: a select from one table drops the
 *  qualifier of its columns.
 *
 *  Example: `db.select({ token: tokens, patrol: PATROL_OF_TOKEN }).from(tokens)` */
export const PATROL_OF_TOKEN = sql<PatrolJson | null>`${sql.raw(
  `(select json_build_object('tokenId', p.token_id, 'path', p.path, 'repeat', p.repeat, 'speed', p.speed::text, 'turns', p.turns, 'gait', p.gait, 'step', p.step, 'startedAt', p.started_at) from token_patrols AS p where p.token_id = "tokens"."id")`,
)}`;

/** The `PATROL_OF_TOKEN` column → the row as the table keeps it.
 *
 *  Example: `rows.map(({ token, patrol }) => ({ token, patrol: patrolPoOf(patrol) }))` */
export function patrolPoOf(json: PatrolJson | null): TokenPatrolPo | null {
  if (!json) return null;
  const startedAt = json.startedAt === null ? null : new Date(json.startedAt);
  return { ...json, startedAt };
}

/** What a token command does with the patrols (the copy of a scene stays inside `TokensDao`). */
export type TokenPatrolWrites = Pick<
  TokenPatrolsDao,
  'save' | 'remove' | 'start' | 'pause' | 'place' | 'countRunningOfScene' | 'runningOf'
>;

/** The patrols of the tokens of a scene: every write is scoped to that scene's tokens (§2.6). Run
 *  the two-statement writes (`pause`, `copyBy`) on the `tx`. */
export class TokenPatrolsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Saves the patrol of a token of the scene (replacing the one it had); a token of another
   *  scene gets none. */
  async save(sceneId: string, patrol: TokenPatrolPo): Promise<void> {
    const { tokenId, repeat, speed, turns, gait, step, startedAt } = patrol;
    const path = JSON.stringify(patrol.path);
    await this.db.execute(
      sql`INSERT INTO ${tokenPatrols} (token_id, path, repeat, speed, turns, gait, step, started_at) SELECT ${tokens.id}, ${path}::jsonb, ${repeat}::token_patrol_repeat, ${speed}::numeric, ${turns}, ${gait}::token_patrol_gait, ${step}, ${startedAt}::timestamptz FROM ${tokens} WHERE ${tokens.id} = ${tokenId} AND ${tokens.sceneId} = ${sceneId} ON CONFLICT (token_id) DO UPDATE SET path = excluded.path, repeat = excluded.repeat, speed = excluded.speed, turns = excluded.turns, gait = excluded.gait, step = excluded.step, started_at = excluded.started_at`,
    );
  }

  /** Takes the patrol away from a token of the scene. */
  async remove(sceneId: string, tokenId: string): Promise<void> {
    await this.db
      .delete(tokenPatrols)
      .where(
        and(eq(tokenPatrols.tokenId, tokenId), inArray(tokenPatrols.tokenId, inScene(sceneId))),
      );
  }

  /** Starts the listed patrols at `at` (the server clock); one of another scene is not written. */
  async start(sceneId: string, tokenIds: readonly string[], at: Date): Promise<void> {
    if (tokenIds.length === 0) return;
    await this.db
      .update(tokenPatrols)
      .set({ startedAt: at })
      .where(
        and(
          inArray(tokenPatrols.tokenId, [...tokenIds]),
          inArray(tokenPatrols.tokenId, inScene(sceneId)),
        ),
      );
  }

  /** Pauses the listed patrols where each token stands: the pose on `tokens` and the step on the
   *  patrol, one `UPDATE … FROM (VALUES …)` per table; a token of another scene keeps both. */
  async pause(sceneId: string, pauses: readonly PatrolPausePo[]): Promise<void> {
    if (pauses.length === 0) return;
    await this.place(sceneId, pauses);
    const steps = pauses.map(({ tokenId, step }) => [tokenId, step]);
    await this.db.execute(
      updateManySql({
        table: tokenPatrols,
        key: tokenPatrols.tokenId,
        columns: [{ column: tokenPatrols.step, cast: 'integer' }],
        rows: steps,
        where: sql`${tokenPatrols.tokenId} IN ${inScene(sceneId)}`,
        alsoSet: sql`${sql.identifier(tokenPatrols.startedAt.name)} = NULL`,
      }),
    );
  }

  /** Writes where each listed token stands and looks, in one `UPDATE` scoped to the scene (a
   *  running patrol stopped where it was, before its route changes). */
  async place(sceneId: string, poses: readonly TokenPosePo[]): Promise<void> {
    if (poses.length === 0) return;
    await this.db.execute(
      updateManySql({
        table: tokens,
        key: tokens.id,
        columns: POSE_COLUMNS,
        rows: poses.map(({ tokenId, col, row, facing }) => [tokenId, col, row, facing]),
        where: eq(tokens.sceneId, sceneId),
        alsoSet: sql`${sql.identifier(tokens.updatedAt.name)} = now()`,
      }),
    );
  }

  /** How many patrols of the scene are running: the ceiling of a start. */
  async countRunningOfScene(sceneId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(tokenPatrols)
      .innerJoin(tokens, eq(tokens.id, tokenPatrols.tokenId))
      .where(and(eq(tokens.sceneId, sceneId), isNotNull(tokenPatrols.startedAt)));
    return row?.total ?? 0;
  }

  /** The running patrols of the listed tokens of the scene, with where each token is stored, in
   *  one query (what a combat that takes them in pauses). */
  async runningOf(sceneId: string, tokenIds: readonly string[]): Promise<PatrolledTokenPo[]> {
    if (tokenIds.length === 0) return [];
    const { id, col, row, facing, width, height, hidden } = tokens;
    return this.db
      .select({ token: { id, col, row, facing, width, height, hidden }, patrol: tokenPatrols })
      .from(tokenPatrols)
      .innerJoin(tokens, eq(tokens.id, tokenPatrols.tokenId))
      .where(
        and(
          eq(tokens.sceneId, sceneId),
          inArray(tokens.id, [...tokenIds]),
          isNotNull(tokenPatrols.startedAt),
        ),
      );
  }

  /** Copies the patrol of each `old_id` token of the map to its `new_id`, paused (the copy stands
   *  where the original is stored, and starting it walks it back to the route). */
  async copyBy(map: SQL, mapName: SQL): Promise<void> {
    const replaced = { tokenId: sql`${mapName}.new_id`, startedAt: sql`NULL::timestamptz` };
    const source = sql`FROM ${tokenPatrols} JOIN ${map} ON ${tokenPatrols.tokenId} = ${mapName}.old_id`;
    await this.db.execute(copyRowsSql(tokenPatrols, replaced, source));
  }
}

const POSE_COLUMNS = [
  { column: tokens.col, cast: 'double precision' },
  { column: tokens.row, cast: 'double precision' },
  { column: tokens.facing, cast: 'smallint' },
] as const;

function inScene(sceneId: string): SQL {
  return sql`(SELECT ${tokens.id} FROM ${tokens} WHERE ${tokens.sceneId} = ${sceneId})`;
}
