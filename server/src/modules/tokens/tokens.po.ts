import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { assets } from '../assets/assets.po';
import { users } from '../auth/users.po';
import { scenes } from '../scenes/scenes.po';

export const tokenSide = pgEnum('token_side', ['ally', 'enemy', 'neutral']);
// The order is the drawing order, top to bottom (`tokenLayerDto`).
export const tokenLayer = pgEnum('token_layer', ['tokens', 'objects', 'background']);
export const barColor = pgEnum('bar_color', ['gold', 'steel', 'ember', 'moss', 'ash']);
export const barVisibility = pgEnum('bar_visibility', ['everyone', 'controllers']);
export const tokenFrame = pgEnum('token_frame', ['square', 'round']);

export const tokens = pgTable(
  'tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sceneId: uuid('scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    initials: text('initials').notNull(),
    side: tokenSide('side').notNull(),
    // In cells, in steps of half a cell: a width × height box anchored at (col, row).
    width: doublePrecision('width').notNull().default(1),
    height: doublePrecision('height').notNull().default(1),
    col: doublePrecision('col').notNull(),
    row: doublePrecision('row').notNull(),
    layer: tokenLayer('layer').notNull().default('tokens'),
    // The look: not a secret, every audience gets it. Losing the asset brings the initials back.
    imageAssetId: uuid('image_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    frame: tokenFrame('frame').notNull().default('square'),
    flipX: boolean('flip_x').notNull().default(false),
    flipY: boolean('flip_y').notNull().default(false),
    // Degrees, 0 = looking right, clockwise on screen (game-core `Facing`).
    facing: smallint('facing').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('tokens_scene_id_idx').on(table.sceneId),
    check('tokens_facing_range', sql`${table.facing} >= 0 AND ${table.facing} <= 359`),
    check(
      'tokens_box_half_cells',
      sql`${table.col} >= 0 AND ${table.row} >= 0 AND ${table.width} BETWEEN 0.5 AND 10 AND ${table.height} BETWEEN 0.5 AND 10 AND (${table.col} * 2) = floor(${table.col} * 2) AND (${table.row} * 2) = floor(${table.row} * 2) AND (${table.width} * 2) = floor(${table.width} * 2) AND (${table.height} * 2) = floor(${table.height} * 2)`,
    ),
  ],
);

// Spec §6 TokenController: the members who may move the token and touch its bars.
export const tokenControllers = pgTable(
  'token_controllers',
  {
    tokenId: uuid('token_id')
      .notNull()
      .references(() => tokens.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.tokenId, table.userId] })],
);

// The `currentHp`/`maxHp` of spec §6, generalized: N bars per token, position 0 drawn on it.
export const tokenBars = pgTable(
  'token_bars',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenId: uuid('token_id')
      .notNull()
      .references(() => tokens.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    label: text('label').notNull(),
    current: integer('current').notNull(),
    max: integer('max').notNull(),
    color: barColor('color').notNull(),
    visibility: barVisibility('visibility').notNull(),
  },
  (table) => [unique('token_bars_token_id_position_unique').on(table.tokenId, table.position)],
);

export type TokenPo = typeof tokens.$inferSelect;
export type NewTokenPo = typeof tokens.$inferInsert;
export type TokenBarPo = typeof tokenBars.$inferSelect;
export type TokenBarInputPo = Omit<typeof tokenBars.$inferInsert, 'id' | 'tokenId' | 'position'>;
export type TokenLayerPo = TokenPo['layer'];
export type TokenLookPo = Pick<TokenPo, 'imageAssetId' | 'frame' | 'flipX' | 'flipY'>;
/** What `token:update` saves; an absent look field keeps what the token has. */
export type TokenFieldsPo = Pick<TokenPo, 'name' | 'initials' | 'side' | 'width' | 'height'> &
  Partial<TokenLookPo>;
