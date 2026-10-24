import { sql, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

/** A column the batch writes, with the Postgres type its parameter is cast to in the VALUES. */
export type UpdatedColumn = Readonly<{ column: PgColumn; cast: string }>;

/** One `UPDATE` for many rows: each row of `rows` is `[key, ...values in the order of columns]`;
 *  `where` scopes it (the scene of the command, §2.6), so a key from elsewhere changes nothing. */
export type UpdateMany = Readonly<{
  table: PgTable;
  key: PgColumn;
  columns: readonly UpdatedColumn[];
  rows: readonly (readonly unknown[])[];
  where: SQL;
  /** Set on every matched row besides the columns, e.g. `"updated_at" = now()`. */
  alsoSet?: SQL;
}>;

const VALUES = sql.identifier('batch');

/** `UPDATE t SET c = batch.c … FROM (VALUES (…), (…)) AS batch(key, c…) WHERE t.key = batch.key
 *  AND <where>`: a group of up to 64 moves in one statement instead of one per row.
 *
 *  Example: `await db.execute(updateManySql({ table: walls, key: walls.id, columns, rows, where }))` */
export function updateManySql(update: UpdateMany): SQL {
  const casts = ['uuid', ...update.columns.map(({ cast }) => cast)];
  const names = [update.key, ...update.columns.map(({ column }) => column)].map((column) =>
    sql.identifier(column.name),
  );
  const values = update.rows.map((row) => sql`(${sql.join(castedRow(row, casts), sql`, `)})`);
  const sets = update.columns.map(({ column }) => {
    const name = sql.identifier(column.name);
    return sql`${name} = ${VALUES}.${name}`;
  });
  if (update.alsoSet) sets.push(update.alsoSet);
  const keyName = sql.identifier(update.key.name);
  return sql`UPDATE ${update.table} SET ${sql.join(sets, sql`, `)} FROM (VALUES ${sql.join(values, sql`, `)}) AS ${VALUES}(${sql.join(names, sql`, `)}) WHERE ${update.key} = ${VALUES}.${keyName} AND ${update.where}`;
}

function castedRow(row: readonly unknown[], casts: readonly string[]): SQL[] {
  if (row.length !== casts.length) {
    throw new Error(
      `a batch row has ${row.length} values; expected ${casts.length} (key + columns)`,
    );
  }
  return row.map((value, index) => sql`${value}::${sql.raw(casts[index] ?? 'text')}`);
}
