import { sql, type SQL } from 'drizzle-orm';

/** Whether the folder a row sits in, or any folder above it, is private, as a column of a select.
 *  `folderColumn` is spelled with the table (`"scenes"."folder_id"`) because a select from one
 *  table drops the qualifier of its columns. `union` ends on a corrupt loop of folders.
 *
 *  Example: `db.select({ id: scenes.id, hiddenByFolder: hiddenByFolderSql('"scenes"."folder_id"') })` */
export function hiddenByFolderSql(folderColumn: string): SQL<boolean> {
  return sql<boolean>`${sql.raw(
    `exists (with recursive chain as (select parent_id, visibility from scene_folders where id = ${folderColumn} union select f.parent_id, f.visibility from scene_folders f join chain on f.id = chain.parent_id) select 1 from chain where visibility = 'private')`,
  )}`;
}
