import { eq, sql, type SQL } from 'drizzle-orm';
import { copyRowsSql } from '../../database/copy-rows';
import type { DatabaseExecutor } from '../../database/transaction';
import { activeConditions } from '../conditions/conditions.po';
import { savedFormsOf, shownFormsSqlOf } from './token-forms.dao';
import type { NewTokenRow, TokenRow } from './tokens.dao';
import {
  tokenBars,
  tokenControllers,
  tokenForms,
  type TokenBarInputPo,
  type TokenBarPo,
  type TokenPo,
} from './tokens.po';

const BAR_DISPLAY_DEFAULT = 'number';

/** The row as saved: the token Postgres returned and the bars and forms as written (ids made
 *  here); the shown form is the one at `activeFormIndex`.
 *
 *  Example: `withIds.map((row) => savedRowOf(row, byId.get(row.token.id)))` */
export function savedRowOf(
  row: NewTokenRow & { token: { id: string } },
  token: TokenPo | undefined,
): TokenRow {
  if (!token) throw new Error(`insert into tokens returned no row for ${row.token.id}`);
  const bars: TokenBarPo[] = row.bars.map((bar, position) => ({
    ...bar,
    display: bar.display ?? BAR_DISPLAY_DEFAULT,
    id: crypto.randomUUID(),
    tokenId: token.id,
    position,
  }));
  const forms = savedFormsOf(token.id, row.forms ?? []);
  const activeFormId = forms[row.activeFormIndex ?? -1]?.id ?? null;
  return { token: { ...token, activeFormId }, bars, controllerIds: [...row.controllerIds], forms };
}

/** What hangs on tokens (bars, controllers, forms, conditions), written for the `TokensDao`
 *  with its executor. Several statements: run it on the `tx`. */
export class TokenHangingDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Bars, controllers, forms and shown forms of a whole batch in one statement (a
   *  data-modifying WITH: the foreign key of the shown form is checked at its end). */
  async writeBatch(saved: readonly TokenRow[]): Promise<void> {
    const statements = [
      sqlIfAny(saved.flatMap(barsOf), (rows) => this.db.insert(tokenBars).values(rows)),
      sqlIfAny(saved.flatMap(controllerRowsOf), (rows) =>
        this.db.insert(tokenControllers).values(rows),
      ),
      sqlIfAny(saved.flatMap(formsOf), (rows) => this.db.insert(tokenForms).values(rows)),
      shownFormsSqlOf(saved),
    ].filter((statement): statement is SQL => statement !== null);
    const last = statements.pop();
    if (!last) return;
    const written = statements.map(
      (each, index) => sql`${sql.raw(`written_${index}`)} AS (${each})`,
    );
    await this.db.execute(
      written.length > 0 ? sql`WITH ${sql.join(written, sql`, `)} ${last}` : last,
    );
  }

  /** The bars and the controllers of one token, replaced whole. */
  async replaceBarsAndControllers(
    tokenId: string,
    bars: readonly TokenBarInputPo[],
    userIds: readonly string[],
  ): Promise<void> {
    await this.db.delete(tokenBars).where(eq(tokenBars.tokenId, tokenId));
    if (bars.length > 0) {
      await this.db
        .insert(tokenBars)
        .values(bars.map((bar, position) => ({ ...bar, tokenId, position })));
    }
    await this.db.delete(tokenControllers).where(eq(tokenControllers.tokenId, tokenId));
    if (userIds.length === 0) return;
    await this.db.insert(tokenControllers).values(userIds.map((userId) => ({ tokenId, userId })));
  }

  /** Copies the bars, controllers and conditions (out of any combat) of each `old_id` token of
   *  the map to its `new_id`. */
  async copyBy(map: SQL, mapName: SQL): Promise<void> {
    const newId = sql`${mapName}.new_id`;
    const fresh = sql`gen_random_uuid()`;
    const barsSource = sql`FROM ${tokenBars} JOIN ${map} ON ${tokenBars.tokenId} = ${mapName}.old_id`;
    await this.db.execute(copyRowsSql(tokenBars, { id: fresh, tokenId: newId }, barsSource));
    const controllers = sql`FROM ${tokenControllers} JOIN ${map} ON ${tokenControllers.tokenId} = ${mapName}.old_id`;
    await this.db.execute(copyRowsSql(tokenControllers, { tokenId: newId }, controllers));
    const conditions = sql`FROM ${activeConditions} JOIN ${map} ON ${activeConditions.tokenId} = ${mapName}.old_id`;
    const outOfCombat = { id: fresh, tokenId: newId, appliedRound: sql`NULL::integer` };
    await this.db.execute(copyRowsSql(activeConditions, outOfCombat, conditions));
  }
}

function barsOf(row: TokenRow): TokenBarPo[] {
  return [...row.bars];
}

function formsOf(row: TokenRow): TokenRow['forms'][number][] {
  return [...row.forms];
}

function controllerRowsOf({
  token,
  controllerIds,
}: TokenRow): { tokenId: string; userId: string }[] {
  return controllerIds.map((userId) => ({ tokenId: token.id, userId }));
}

// The insert of a batch's hanging rows, or nothing for none (an empty VALUES is invalid SQL).
function sqlIfAny<T>(rows: T[], insertOf: (rows: T[]) => Readonly<{ getSQL(): SQL }>): SQL | null {
  return rows.length > 0 ? insertOf(rows).getSQL() : null;
}
