import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { campaigns } from '../campaigns/campaigns.po';

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
    // The board state version (spec §5.5): persisted, so it survives a server restart.
    version: integer('version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('scenes_campaign_id_idx').on(table.campaignId)],
);

export type ScenePo = typeof scenes.$inferSelect;
export type NewScenePo = typeof scenes.$inferInsert;
export type SceneGridPo = Pick<
  ScenePo,
  'widthCells' | 'heightCells' | 'cellDistance' | 'cellUnit' | 'gridVisible' | 'gridOpacity'
>;
