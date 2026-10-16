import {
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';
import { scenes } from '../scenes/scenes.po';

export const tokenSide = pgEnum('token_side', ['ally', 'enemy', 'neutral']);
export const barColor = pgEnum('bar_color', ['gold', 'steel', 'ember', 'moss', 'ash']);
export const barVisibility = pgEnum('bar_visibility', ['everyone', 'controllers']);

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
    // In cells; the token is a size × size square anchored at (col, row).
    size: integer('size').notNull().default(1),
    col: integer('col').notNull(),
    row: integer('row').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('tokens_scene_id_idx').on(table.sceneId)],
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
export type TokenFieldsPo = Pick<TokenPo, 'name' | 'initials' | 'side' | 'size'>;
