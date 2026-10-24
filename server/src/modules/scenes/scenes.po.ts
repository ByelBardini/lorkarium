import {
  boolean,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { assets } from '../assets/assets.po';
import { campaigns } from '../campaigns/campaigns.po';
import { sceneFolders } from '../library/scene-folders.po';

// What the scene hides from players: nothing (off), past each token's sight (dark), or only
// behind walls (daylight).
export const sceneVision = pgEnum('scene_vision', ['off', 'dark', 'daylight']);

// Who sees the scene in the library: only the master (private) or every member (public).
export const sceneVisibility = pgEnum('scene_visibility', ['private', 'public']);

// A grid of the library, or the hidden cast of the table: one per campaign, holding the anchor
// token of each character; never listed, drawn nor activated.
export const sceneKind = pgEnum('scene_kind', ['grid', 'cast']);

/** The name the cast is born with; no screen shows it. */
export const CAST_SCENE_NAME = 'Elenco';

export const scenes = pgTable(
  'scenes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull().default('Cena 1'),
    widthCells: integer('width_cells').notNull().default(20),
    heightCells: integer('height_cells').notNull().default(12),
    // numeric keeps "1,5 m" exact; the mapper turns the string into a number.
    cellDistance: numeric('cell_distance', { precision: 6, scale: 2 }).notNull().default('1.5'),
    cellUnit: text('cell_unit').notNull().default('m'),
    gridVisible: boolean('grid_visible').notNull().default(true),
    gridOpacity: integer('grid_opacity').notNull().default(30),
    // The image stretched over the whole scene; losing the asset only takes the background away.
    backgroundAssetId: uuid('background_asset_id').references(() => assets.id, {
      onDelete: 'set null',
    }),
    visionMode: sceneVision('vision_mode').notNull().default('off'),
    visibility: sceneVisibility('visibility').notNull().default('private'),
    folderId: uuid('folder_id'),
    kind: sceneKind('kind').notNull().default('grid'),
    // The board state version (spec §5.5): persisted, so it survives a server restart.
    version: integer('version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('scenes_campaign_id_idx').on(table.campaignId),
    uniqueIndex('scenes_one_cast_per_campaign')
      .on(table.campaignId)
      .where(sql`${table.kind} = 'cast'`),
    // The migration narrows it to SET NULL ("folder_id"): deleting a folder never touches
    // campaign_id, and a folder of another campaign is refused.
    foreignKey({
      name: 'scenes_folder_fk',
      columns: [table.campaignId, table.folderId],
      foreignColumns: [sceneFolders.campaignId, sceneFolders.id],
    }).onDelete('set null'),
  ],
);

export type ScenePo = typeof scenes.$inferSelect;
export type NewScenePo = typeof scenes.$inferInsert;
export type SceneKindPo = ScenePo['kind'];
export type SceneGridPo = Pick<
  ScenePo,
  'widthCells' | 'heightCells' | 'cellDistance' | 'cellUnit' | 'gridVisible' | 'gridOpacity'
>;
/** What the library edits on a scene: an absent key stays. */
export type SceneLibraryChangesPo = Partial<Pick<ScenePo, 'name' | 'folderId' | 'visibility'>>;
/** What `scene:configure` saves: the grid, the background and the vision mode. */
export type SceneConfigPo = SceneGridPo & Pick<ScenePo, 'backgroundAssetId' | 'visionMode'>;
