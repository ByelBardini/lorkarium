import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { scenes } from '../scenes/scenes.po';

export const wallKind = pgEnum('wall_kind', ['wall', 'grate', 'curtain', 'door']);
export const wallShape = pgEnum('wall_shape', ['line', 'freehand', 'rectangle', 'ellipse']);
export const doorState = pgEnum('door_state', ['closed', 'open', 'locked']);

// Same geometry as a drawing: fractional cells (never pixels), exact to 0.01 by numeric.
export const walls = pgTable(
  'walls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sceneId: uuid('scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    // created_at ties inside one insert of many; this keeps the creation order.
    wallOrder: integer('wall_order').notNull().generatedAlwaysAsIdentity(),
    kind: wallKind('kind').notNull(),
    shape: wallShape('shape').notNull(),
    x: numeric('x', { precision: 8, scale: 2 }).notNull(),
    y: numeric('y', { precision: 8, scale: 2 }).notNull(),
    width: numeric('width', { precision: 8, scale: 2 }).notNull(),
    height: numeric('height', { precision: 8, scale: 2 }).notNull(),
    // Line and freehand only: points relative to (x, y).
    points: jsonb('points').$type<[number, number][]>(),
    doorState: doorState('door_state'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('walls_scene_id_idx').on(table.sceneId),
    check('walls_door_state', sql`(${table.kind} = 'door') = (${table.doorState} IS NOT NULL)`),
    check('walls_door_line', sql`${table.kind} <> 'door' OR ${table.shape} = 'line'`),
  ],
);

export type WallPo = typeof walls.$inferSelect;
export type NewWallPo = Omit<typeof walls.$inferInsert, 'id' | 'wallOrder' | 'createdAt'>;
/** Where one wall of a group lands, as numeric strings. */
export type WallMovePo = Readonly<{ wallId: string; x: string; y: string }>;
/** The kind one wall of a group takes, with the door state that goes with it. */
export type WallKindPo = Readonly<{
  wallId: string;
  kind: WallPo['kind'];
  doorState: WallPo['doorState'];
}>;
