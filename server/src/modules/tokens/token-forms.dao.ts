import { eq, sql, type SQL } from 'drizzle-orm';
import { copyRowsSql } from '../../database/copy-rows';
import type { DatabaseExecutor } from '../../database/transaction';
import { batchColumn, updateManySql } from '../../database/update-many';
import {
  tokenForms,
  tokens,
  type TokenFormInputPo,
  type TokenFormPo,
  type TokenPo,
  type TokenStylePo,
} from './tokens.po';

/** The forms of the selected token, by position, as one json column (`[]` for none): read in the
 *  same query as its controllers, so the forms cost no statement of their own. */
// Spelled out with the table names: a select from one table drops the qualifier of every column,
// and an unqualified "id" in the subquery would be the form's, not the token's.
export const FORMS_OF_TOKEN = sql<TokenFormPo[]>`coalesce((${sql.raw(
  `select json_agg(json_build_object('id', f.id, 'tokenId', f.token_id, 'position', f.position, 'name', f.name, 'imageAssetId', f.image_asset_id, 'width', f.width, 'height', f.height, 'frame', f.frame) order by f.position) from token_forms AS f where f.token_id = "tokens"."id"`,
)}), '[]'::json)`;

/** The `SET` of a batch resize: a size other than the batch row's leaves the token without its
 *  form (resized by hand).
 *
 *  Example: `updateManySql({ …, alsoSet: formKeptIfSameSize() })` */
export function formKeptIfSameSize(): SQL {
  const sizeChanged = sql`${tokens.width} IS DISTINCT FROM ${batchColumn(tokens.width)} OR ${tokens.height} IS DISTINCT FROM ${batchColumn(tokens.height)}`;
  return sql`${sql.identifier(tokens.activeFormId.name)} = CASE WHEN ${sizeChanged} THEN NULL ELSE ${tokens.activeFormId} END`;
}

/** The extra `SET` of a restyle: a new image or frame leaves each token without its form,
 *  unless the style names the form itself (a form switch).
 *
 *  Example: `db.update(tokens).set({ ...style, ...formKeptByLook(style) })` */
export function formKeptByLook(style: Partial<TokenStylePo>): Readonly<{ activeFormId?: SQL }> {
  if (style.activeFormId !== undefined) return {};
  const changes = lookChangesOf(style);
  if (changes.length === 0) return {};
  const changed = sql.join(changes, sql` OR `);
  return { activeFormId: sql`CASE WHEN ${changed} THEN NULL ELSE ${tokens.activeFormId} END` };
}

function lookChangesOf({ imageAssetId, frame }: Partial<TokenStylePo>): SQL[] {
  const changes: SQL[] = [];
  if (imageAssetId !== undefined) {
    changes.push(sql`${tokens.imageAssetId} IS DISTINCT FROM ${imageAssetId}::uuid`);
  }
  if (frame !== undefined) changes.push(sql`${tokens.frame}::text <> ${frame}`);
  return changes;
}

/** One `UPDATE` pointing each pasted token at the form it shows, or `null` when none shows one.
 *
 *  Example: `shownFormsSqlOf(saved) // part of the WITH of TokensDao.insertMany` */
export function shownFormsSqlOf(saved: readonly Readonly<{ token: TokenPo }>[]): SQL | null {
  const rows = saved.flatMap(({ token }) =>
    token.activeFormId ? [[token.id, token.activeFormId]] : [],
  );
  if (rows.length === 0) return null;
  const columns = [{ column: tokens.activeFormId, cast: 'uuid' }];
  return updateManySql({ table: tokens, key: tokens.id, columns, rows, where: sql`true` });
}

/** The forms of a token as saved: each a new id, unless `keptIds` (the ids the token already had)
 *  holds it; an id of another token's form is never reused, so it cannot collide nor be taken.
 *
 *  Example: `savedFormsOf(lyraId, command.forms, new Set([wolfId]))` */
export function savedFormsOf(
  tokenId: string,
  forms: readonly TokenFormInputPo[],
  keptIds: ReadonlySet<string> = new Set(),
): TokenFormPo[] {
  return forms.map(({ id, name, imageAssetId, width, height, frame }, position) => ({
    id: keptIds.has(id) ? id : crypto.randomUUID(),
    tokenId,
    position,
    name,
    imageAssetId,
    width,
    height,
    frame,
  }));
}

/** The forms of tokens. Several statements: run it on a DAO built with the `tx`. */
export class TokenFormsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Replaces the forms of `tokenId` with `forms`, in their order, keeping the ids it had. The
   *  dropped active form leaves the token without one (FK set null): the caller writes the
   *  `active_form_id` it keeps after this. */
  async replace(tokenId: string, forms: readonly TokenFormInputPo[]): Promise<void> {
    const dropped = await this.db
      .delete(tokenForms)
      .where(eq(tokenForms.tokenId, tokenId))
      .returning({ id: tokenForms.id });
    if (forms.length === 0) return;
    const keptIds = new Set(dropped.map(({ id }) => id));
    await this.db.insert(tokenForms).values(savedFormsOf(tokenId, forms, keptIds));
  }

  /** Copies the forms of each `copy_map.old_id` token to its `new_id` with new ids, and points
   *  each copy at the copy of the form its original shows (matched by position). */
  async copyBy(map: SQL, mapName: SQL): Promise<void> {
    const source = sql`FROM ${tokenForms} JOIN ${map} ON ${tokenForms.tokenId} = ${mapName}.old_id`;
    const replaced = { id: sql`gen_random_uuid()`, tokenId: sql`${mapName}.new_id` };
    await this.db.execute(copyRowsSql(tokenForms, replaced, source));
    await this.db.execute(sql`UPDATE tokens AS copy SET active_form_id = new_form.id
      FROM ${map}
      JOIN tokens AS original ON original.id = ${mapName}.old_id
      JOIN token_forms AS old_form ON old_form.id = original.active_form_id
      JOIN token_forms AS new_form ON new_form.token_id = ${mapName}.new_id AND new_form.position = old_form.position
      WHERE copy.id = ${mapName}.new_id`);
  }
}
