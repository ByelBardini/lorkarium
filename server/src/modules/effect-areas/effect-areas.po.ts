import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';
import { drawingColor } from '../drawings/drawings.po';
import { scenes } from '../scenes/scenes.po';

export const effectAreaKind = pgEnum('effect_area_kind', [
  'square',
  'circle',
  'semicircle',
  'orthogonal_cone',
  'diagonal_cone',
  'line',
  'emanation',
  'smooth_circle',
  'smooth_semicircle',
]);

// Origin and sizes are fractional cells (never pixels), exact to 0.01; a field the kind does
// not use is 0. The rules per kind live in the game-core and the DTO, the table only checks ranges.
export const effectAreas = pgTable(
  'effect_areas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sceneId: uuid('scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    // A deleted account leaves its areas behind; only the master edits them then.
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    // created_at ties inside one insert of many; this keeps the creation (and drawing) order.
    areaOrder: integer('area_order').notNull().generatedAlwaysAsIdentity(),
    kind: effectAreaKind('kind').notNull(),
    x: numeric('x', { precision: 8, scale: 2 }).notNull(),
    y: numeric('y', { precision: 8, scale: 2 }).notNull(),
    width: numeric('width', { precision: 8, scale: 2 }).notNull(),
    height: numeric('height', { precision: 8, scale: 2 }).notNull(),
    reach: numeric('reach', { precision: 8, scale: 2 }).notNull(),
    facing: smallint('facing').notNull().default(0),
    color: drawingColor('color').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('effect_areas_scene_id_idx').on(table.sceneId),
    check('effect_areas_facing_range', sql`${table.facing} >= 0 AND ${table.facing} <= 359`),
    check(
      'effect_areas_sizes_range',
      sql`${table.x} >= 0 AND ${table.y} >= 0 AND ${table.width} >= 0 AND ${table.height} >= 0 AND ${table.reach} >= 0`,
    ),
  ],
);

export type EffectAreaPo = typeof effectAreas.$inferSelect;
export type NewEffectAreaPo = Omit<
  typeof effectAreas.$inferInsert,
  'id' | 'areaOrder' | 'createdAt'
>;
/** The new shape of one area of a group, as numeric strings (the author and scene never change). */
export type EffectAreaReshapePo = Readonly<{
  effectAreaId: string;
  shape: Pick<
    NewEffectAreaPo,
    'kind' | 'x' | 'y' | 'width' | 'height' | 'reach' | 'facing' | 'color'
  >;
}>;
