import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { scenes } from '../scenes/scenes.po';

/** The light palette by name (contracts `LIGHT_COLORS`; the mapper's types catch a drift); also
 *  the color of a token's light (`tokens.light_color`). */
export const lightColorEnum = pgEnum('light_color', [
  'torch',
  'candle',
  'fire',
  'moon',
  'arcane',
  'necrotic',
  'infernal',
]);

// A light on the map (a wall torch, a campfire): a point in fractional cells, exact to 0.01 by
// numeric. Only the master touches it, so there is no author.
export const lights = pgTable(
  'lights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sceneId: uuid('scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    // created_at ties inside one insert of many; this keeps the creation order.
    lightOrder: integer('light_order').notNull().generatedAlwaysAsIdentity(),
    x: numeric('x', { precision: 8, scale: 2 }).notNull(),
    y: numeric('y', { precision: 8, scale: 2 }).notNull(),
    bright: numeric('bright', { precision: 6, scale: 2 }).notNull(),
    dim: numeric('dim', { precision: 6, scale: 2 }).notNull(),
    lit: boolean('lit').notNull().default(true),
    // Null is the neutral light: it reveals without tinting.
    color: lightColorEnum('color'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('lights_scene_id_idx').on(table.sceneId),
    check(
      'lights_range',
      sql`${table.bright} BETWEEN 0 AND 100 AND ${table.dim} BETWEEN 0 AND 100`,
    ),
    // "Inside the scene" is the rule's: the scene can shrink.
    check('lights_position', sql`${table.x} >= 0 AND ${table.y} >= 0`),
  ],
);

export type LightPo = typeof lights.$inferSelect;
export type NewLightPo = Omit<typeof lights.$inferInsert, 'id' | 'lightOrder' | 'createdAt'>;
/** Where one light of a group lands, as numeric strings. */
export type LightMovePo = Readonly<{ lightId: string; x: string; y: string }>;
/** The range one light of a group takes, as numeric strings. */
export type LightRangePo = Readonly<{ lightId: string; bright: string; dim: string }>;
/** The color one light of a group takes (`null` = neutral). */
export type LightColorPo = Readonly<{ lightId: string; color: LightPo['color'] }>;
