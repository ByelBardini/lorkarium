import type { MapPinIconDto } from '@lorkarium/contracts';
import type { MapRegionGeometry } from '@lorkarium/game-core';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { campaigns } from '../campaigns/campaigns.po';
import { libraryDocuments } from '../documents/documents.po';
import { libraryImages } from '../library/library-images.po';
import { scenes } from '../scenes/scenes.po';
import { libraryMaps } from './library-maps.po';

// Outlives the target on purpose: filled in with every target null is the "link removed" state,
// which needs no extra column and no trigger because SET NULL only clears the target column.
export const mapRegionLinkKind = pgEnum('map_region_link_kind', [
  'document',
  'scene',
  'map',
  'image',
]);

export const libraryMapRegions = pgTable(
  'library_map_regions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    mapId: uuid('map_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    // Validated by the game-core before it gets here.
    geometry: jsonb('geometry').$type<MapRegionGeometry>().notNull(),
    color: text('color').notNull(),
    // Text, not a pgEnum: the list lives in the contract, and a new icon should need no migration.
    icon: text('icon').$type<MapPinIconDto>().notNull().default('pin'),
    hidden: boolean('hidden').notNull().default(false),
    linkKind: mapRegionLinkKind('link_kind'),
    targetDocumentId: uuid('target_document_id'),
    targetSceneId: uuid('target_scene_id'),
    targetMapId: uuid('target_map_id'),
    targetImageId: uuid('target_image_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('library_map_regions_map_idx').on(t.campaignId, t.mapId),
    index('library_map_regions_target_document_idx').on(t.campaignId, t.targetDocumentId),
    index('library_map_regions_target_scene_idx').on(t.campaignId, t.targetSceneId),
    index('library_map_regions_target_map_idx').on(t.campaignId, t.targetMapId),
    index('library_map_regions_target_image_idx').on(t.campaignId, t.targetImageId),
    foreignKey({
      name: 'library_map_regions_map_fk',
      columns: [t.campaignId, t.mapId],
      foreignColumns: [libraryMaps.campaignId, libraryMaps.id],
    }).onDelete('cascade'),
    // The migration narrows the four below to SET NULL ("target_…"): campaign_id must survive.
    foreignKey({
      name: 'library_map_regions_target_document_fk',
      columns: [t.campaignId, t.targetDocumentId],
      foreignColumns: [libraryDocuments.campaignId, libraryDocuments.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'library_map_regions_target_scene_fk',
      columns: [t.campaignId, t.targetSceneId],
      foreignColumns: [scenes.campaignId, scenes.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'library_map_regions_target_map_fk',
      columns: [t.campaignId, t.targetMapId],
      foreignColumns: [libraryMaps.campaignId, libraryMaps.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'library_map_regions_target_image_fk',
      columns: [t.campaignId, t.targetImageId],
      foreignColumns: [libraryImages.campaignId, libraryImages.id],
    }).onDelete('set null'),
    check('library_map_regions_name_length', sql`char_length(${t.name}) BETWEEN 1 AND 60`),
    check('library_map_regions_description_length', sql`char_length(${t.description}) <= 500`),
    check('library_map_regions_color_hex', sql`${t.color} ~ '^#[0-9a-f]{6}$'`),
    // IS NOT DISTINCT FROM, not `=`: a target with a null kind would make `=` null, and a CHECK
    // that evaluates to null passes.
    check(
      'library_map_regions_link_target',
      sql`num_nonnulls(${t.targetDocumentId}, ${t.targetSceneId}, ${t.targetMapId}, ${t.targetImageId}) <= 1 AND (${t.targetDocumentId} IS NULL OR ${t.linkKind} IS NOT DISTINCT FROM 'document') AND (${t.targetSceneId} IS NULL OR ${t.linkKind} IS NOT DISTINCT FROM 'scene') AND (${t.targetMapId} IS NULL OR ${t.linkKind} IS NOT DISTINCT FROM 'map') AND (${t.targetImageId} IS NULL OR ${t.linkKind} IS NOT DISTINCT FROM 'image')`,
    ),
  ],
);

export type MapRegionPo = typeof libraryMapRegions.$inferSelect;
export type NewMapRegionPo = typeof libraryMapRegions.$inferInsert;
/** What editing a region changes: an absent key stays. Replacing a link sends the kind and all
 *  four targets, because the CHECK refuses a row whose old target stayed behind. */
export type MapRegionChangesPo = Partial<
  Pick<
    MapRegionPo,
    | 'name'
    | 'description'
    | 'geometry'
    | 'color'
    | 'icon'
    | 'hidden'
    | 'linkKind'
    | 'targetDocumentId'
    | 'targetSceneId'
    | 'targetMapId'
    | 'targetImageId'
  >
>;
