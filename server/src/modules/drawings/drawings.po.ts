import { DRAWING_PALETTE, type DrawingColorDto } from '@lorkarium/contracts';
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { paletteOrHexSql } from '../../database/palette-or-hex-sql';
import { users } from '../auth/users.po';
import { scenes } from '../scenes/scenes.po';

export const drawingKind = pgEnum('drawing_kind', ['freehand', 'rectangle', 'ellipse', 'triangle']);
export const strokeWidth = pgEnum('stroke_width', ['thin', 'medium', 'thick']);

// Positions and sizes are fractional cells (never pixels), kept exact to 0.01 by numeric.
export const drawings = pgTable(
  'drawings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sceneId: uuid('scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    // A deleted account leaves its drawings behind; only the master edits them then.
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    // created_at ties inside one insert of many; this keeps the creation (and drawing) order.
    drawOrder: integer('draw_order').notNull().generatedAlwaysAsIdentity(),
    kind: drawingKind('kind').notNull(),
    x: numeric('x', { precision: 8, scale: 2 }).notNull(),
    y: numeric('y', { precision: 8, scale: 2 }).notNull(),
    width: numeric('width', { precision: 8, scale: 2 }).notNull(),
    height: numeric('height', { precision: 8, scale: 2 }).notNull(),
    // Freehand only: points relative to (x, y).
    points: jsonb('points').$type<[number, number][]>(),
    stroke: text('stroke').$type<DrawingColorDto>().notNull(),
    // Fixed shapes only; null = no fill.
    fill: text('fill').$type<DrawingColorDto>(),
    strokeWidth: strokeWidth('stroke_width').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('drawings_scene_id_idx').on(table.sceneId),
    check('drawings_stroke_color', paletteOrHexSql(table.stroke, DRAWING_PALETTE)),
    check('drawings_fill_color', paletteOrHexSql(table.fill, DRAWING_PALETTE)),
  ],
);

export type DrawingPo = typeof drawings.$inferSelect;
export type NewDrawingPo = Omit<typeof drawings.$inferInsert, 'id' | 'drawOrder' | 'createdAt'>;
/** Where one drawing of a group lands, as numeric strings. */
export type DrawingMovePo = Readonly<{ drawingId: string; x: string; y: string }>;
