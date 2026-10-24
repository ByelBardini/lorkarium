import { getTableColumns, sql, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

/** The expressions that replace a source column in the copy, by the column's property name. */
export type CopiedColumns = Readonly<Partial<Record<string, SQL>>>;

/** `INSERT INTO table (…) SELECT … <source>`: copies rows of `table` in one statement. Every
 *  column goes as it is unless `replaced` gives its expression; identity and generated columns
 *  are left to the database (a copied order column gets new numbers, in the order of `source`).
 *  `source` is the `FROM … WHERE … ORDER BY …` tail, and may join a map of ids.
 *
 *  Example: `await db.execute(copyRowsSql(walls, { id: sql\`gen_random_uuid()\` }, sql\`FROM ${walls} WHERE …\`))` */
export function copyRowsSql(table: PgTable, replaced: CopiedColumns, source: SQL): SQL {
  const columns = Object.entries(getTableColumns(table)).filter(
    ([, column]) => column.generatedIdentity === undefined && column.generated === undefined,
  );
  const names = columns.map(([, column]) => sql.identifier(column.name));
  const values = columns.map(([key, column]) => replaced[key] ?? sql`${column}`);
  return sql`INSERT INTO ${table} (${sql.join(names, sql`, `)}) SELECT ${sql.join(values, sql`, `)} ${source}`;
}

/** `ids` as one `uuid[]` parameter (a Drizzle array would become a list of parameters).
 *
 *  Example: `sql\`unnest(${uuidArray(oldIds)}, ${uuidArray(newIds)})\`` */
export function uuidArray(ids: readonly string[]): SQL {
  return sql`${`{${ids.join(',')}}`}::uuid[]`;
}

/** A table of things on a scene: its `sceneId` and the column that keeps their order. */
export type SceneRowsCopy = Readonly<{ table: PgTable; sceneId: PgColumn; order: PgColumn }>;

/** Copies every row of `fromSceneId` into `toSceneId` with new ids, in their order. The table
 *  names its columns `id` and `sceneId`.
 *
 *  Example: `await db.execute(sceneRowsCopySql({ table: walls, sceneId: walls.sceneId, order: walls.wallOrder }, from, to))` */
export function sceneRowsCopySql(copy: SceneRowsCopy, fromSceneId: string, toSceneId: string): SQL {
  const replaced = { id: sql`gen_random_uuid()`, sceneId: sql`${toSceneId}::uuid` };
  const source = sql`FROM ${copy.table} WHERE ${copy.sceneId} = ${fromSceneId} ORDER BY ${copy.order}`;
  return copyRowsSql(copy.table, replaced, source);
}
