import { and, eq, getTableName, inArray, lte, notExists, sql, sum, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { DatabaseExecutor } from '../../database/transaction';
import { campaigns } from '../campaigns/campaigns.po';
import { characters } from '../characters/characters.po';
import { conditionDefinitions } from '../conditions/conditions.po';
import { libraryDocumentAssets } from '../documents/document-assets.po';
import { libraryImages } from '../library/library-images.po';
import { libraryMaps } from '../library-maps/library-maps.po';
import { scenes } from '../scenes/scenes.po';
import { sheetAssets } from '../sheets/sheet-assets.po';
import { sheetTemplates } from '../sheets/sheet-templates.po';
import { tokenForms, tokens } from '../tokens/tokens.po';
import { assets } from './assets.po';

type AssetForeignKey = Readonly<{ table: PgTable; column: AnyPgColumn }>;

// Every column with a foreign key to `assets.id`. A table that gains one must come here, or the
// sweep would delete a file it still shows; `asset-sweep.spec.ts` compares this list with the
// constraints of the database.
const ASSET_FOREIGN_KEYS: readonly AssetForeignKey[] = [
  { table: campaigns, column: campaigns.coverAssetId },
  { table: scenes, column: scenes.backgroundAssetId },
  { table: tokens, column: tokens.imageAssetId },
  { table: tokens, column: tokens.auraImageAssetId },
  { table: tokenForms, column: tokenForms.imageAssetId },
  { table: characters, column: characters.imageAssetId },
  { table: characters, column: characters.auraImageAssetId },
  { table: conditionDefinitions, column: conditionDefinitions.imageAssetId },
  { table: libraryImages, column: libraryImages.assetId },
  { table: libraryMaps, column: libraryMaps.assetId },
  { table: libraryDocumentAssets, column: libraryDocumentAssets.assetId },
  { table: sheetAssets, column: sheetAssets.assetId },
];

// Any stable number shared by every server: one sweep at a time across the instances.
const SWEEP_LOCK_KEY = 7_302_150_016;

/** A loose file to delete: its row id and the key of its object. */
export type LooseAssetRow = Readonly<{ id: string; storageKey: string }>;

/** Each column that references an asset, as `table.column`, in the order of the list.
 *
 *  Example: `assetReferenceColumns()[0] // 'campaigns.cover_asset_id'` */
export function assetReferenceColumns(): string[] {
  return ASSET_FOREIGN_KEYS.map(({ table, column }) => `${getTableName(table)}.${column.name}`);
}

/** Who still uses a file: every foreign key to `assets` and the asset list of a sheet template's
 *  manifest (JSON, without a key). A file nothing uses is loose once older than the grace. */
export class AssetReferencesDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** The bytes the tables `ownerId` owns keep: every file in use and every loose one created
   *  after `cutoff` (`looseCutoffOf(now)`). Inside the upload's transaction, after the owner's
   *  lock, two uploads never both count the same total.
   *
   *  Example: `await references.usageOfOwner(biaId, looseCutoffOf(now)) // 104_857_600` */
  async usageOfOwner(ownerId: string, cutoff: Date): Promise<number> {
    const owned = eq(campaigns.ownerId, ownerId);
    const total = await this.bytesOf(owned);
    const loose = await this.bytesOf(and(owned, lte(assets.createdAt, cutoff), ...unused()));
    return total - loose;
  }

  /** Up to `limit` files created up to `cutoff` that nothing uses, locked (`FOR UPDATE`): a
   *  reference written meanwhile waits for the sweep's transaction (its foreign key check takes
   *  the row) and then fails, never pointing at a deleted file.
   *
   *  Example: `await references.unreferencedOlderThan(looseCutoffOf(now), 500)` */
  async unreferencedOlderThan(cutoff: Date, limit: number): Promise<LooseAssetRow[]> {
    return this.db
      .select({ id: assets.id, storageKey: assets.storageKey })
      .from(assets)
      .where(and(lte(assets.createdAt, cutoff), ...unused()))
      .orderBy(assets.createdAt)
      .limit(limit)
      .for('update', { of: assets });
  }

  /** Deletes the asked files that are still loose (checked again, in a new statement) and returns
   *  the key of each deleted one; the objects are removed by the caller after the commit.
   *
   *  Example: `await references.deleteUnreferenced(ids, cutoff) // ['assets/<id>']` */
  async deleteUnreferenced(assetIds: readonly string[], cutoff: Date): Promise<string[]> {
    if (assetIds.length === 0) return [];
    const loose = and(
      inArray(assets.id, [...assetIds]),
      lte(assets.createdAt, cutoff),
      ...unused(),
    );
    const rows = await this.db
      .delete(assets)
      .where(loose)
      .returning({ storageKey: assets.storageKey });
    return rows.map((row) => row.storageKey);
  }

  /** Takes the sweep's lock until the transaction ends; `false` when another sweep holds it.
   *
   *  Example: `if (!(await references.claimSweep())) return []` */
  async claimSweep(): Promise<boolean> {
    const result = await this.db.execute<{ claimed: boolean }>(
      sql`select pg_try_advisory_xact_lock(${SWEEP_LOCK_KEY}) as claimed`,
    );
    return result.rows[0]?.claimed === true;
  }

  private async bytesOf(where: SQL | undefined): Promise<number> {
    const [row] = await this.db
      .select({ bytes: sum(assets.sizeBytes).mapWith(Number) })
      .from(assets)
      .innerJoin(campaigns, eq(campaigns.id, assets.campaignId))
      .where(where);
    return row?.bytes ?? 0;
  }
}

// Top-level `NOT EXISTS`, so the planner turns each into an anti join (no index needed).
function unused(): SQL[] {
  const byKey = ASSET_FOREIGN_KEYS.map(({ table, column }) =>
    notExists(sql`(select 1 from ${table} where ${column} = ${assets.id})`),
  );
  const declared = sql`jsonb_build_array(jsonb_build_object('assetId', ${assets.id}::text))`;
  const inManifest = notExists(
    sql`(select 1 from ${sheetTemplates} where ${sheetTemplates.campaignId} = ${assets.campaignId} and ${sheetTemplates.manifest} -> 'assets' @> ${declared})`,
  );
  return [...byKey, inManifest];
}
