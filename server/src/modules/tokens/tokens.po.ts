import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { assets } from '../assets/assets.po';
import { users } from '../auth/users.po';
import { characters } from '../characters/characters.po';
import { lightColorEnum } from '../lights/lights.po';
import { scenes } from '../scenes/scenes.po';
import {
  auraColumns,
  auraFieldsSql,
  auraShapeSql,
  barColumns,
  boxSizeColumns,
  halfCellSizeSql,
  tokenFrame,
  tokenLayer,
  tokenSide,
} from './token-columns.po';

export {
  auraEffect,
  barColor,
  barDisplay,
  barVisibility,
  tokenAuraKind,
  tokenFrame,
  tokenLayer,
  tokenSide,
} from './token-columns.po';

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
    ...boxSizeColumns(),
    col: doublePrecision('col').notNull(),
    row: doublePrecision('row').notNull(),
    layer: tokenLayer('layer').notNull().default('tokens'),
    // The look: not a secret, every audience gets it. Losing the asset brings the initials back.
    imageAssetId: uuid('image_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    frame: tokenFrame('frame').notNull().default('square'),
    flipX: boolean('flip_x').notNull().default(false),
    flipY: boolean('flip_y').notNull().default(false),
    // The red cross of a fallen foe: only a restyle marks it, a new token is alive.
    defeated: boolean('defeated').notNull().default(false),
    // Degrees, 0 = looking right, clockwise on screen (game-core `Facing`).
    facing: smallint('facing').notNull().default(0),
    // How wide it sees around its facing, in whole degrees (game-core `ConeAngle`); 360 = every
    // side. Outside `sight` because a blind token also looks in a cone.
    sightAngle: smallint('sight_angle').notNull().default(360),
    // How far it sees, in cells (game-core `SightRange`); both null = it does not see. A CHECK
    // passes on NULL, so the second branch names both as not null.
    sightBright: numeric('sight_bright', { precision: 6, scale: 2 }),
    sightDim: numeric('sight_dim', { precision: 6, scale: 2 }),
    // The light it gives off, in cells (game-core `LightRange`); both null = no light. Whoever
    // controls it lights and puts it out (`lightLit`); a new token is lit.
    lightBright: numeric('light_bright', { precision: 6, scale: 2 }),
    lightDim: numeric('light_dim', { precision: 6, scale: 2 }),
    lightLit: boolean('light_lit').notNull().default(true),
    // Null is neutral; only a light with a range has a color (CHECK tokens_light_color).
    lightColor: lightColorEnum('light_color'),
    // How wide the beam opens toward the facing (a lantern); 360 = every side, and no light
    // brings it back to 360.
    lightAngle: smallint('light_angle').notNull().default(360),
    ...auraColumns(),
    // Hidden from the players: only the masters and its controllers ever receive it.
    hidden: boolean('hidden').notNull().default(false),
    // The anchor (in the table's cast) of the character this token is: it lends its identity,
    // bars, controllers, conditions and defeat mark. Losing the anchor unlinks the token.
    anchorTokenId: uuid('anchor_token_id').references((): AnyPgColumn => tokens.id, {
      onDelete: 'set null',
    }),
    // The character this token is an instance of (filled by the 0075 migration from the anchor);
    // losing the character unlinks the token.
    characterId: uuid('character_id').references((): AnyPgColumn => characters.id, {
      onDelete: 'set null',
    }),
    // Who created it: a player edits and deletes only their own (game-core `token-rights`).
    // Null = made before authorship was kept, or the account is gone (only the master then).
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    // The form it shows now (its own, or a linked token's anchor's); losing the form, or changing
    // the image or the size by hand, leaves it without one.
    activeFormId: uuid('active_form_id').references((): AnyPgColumn => tokenForms.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('tokens_scene_id_idx').on(table.sceneId),
    // One token of each character per grid.
    unique('tokens_scene_id_anchor_token_id_unique').on(table.sceneId, table.anchorTokenId),
    unique('tokens_scene_id_character_id_unique').on(table.sceneId, table.characterId),
    check('tokens_facing_range', sql`${table.facing} >= 0 AND ${table.facing} <= 359`),
    check('tokens_sight_angle', sql`${table.sightAngle} BETWEEN 1 AND 360`),
    check('tokens_light_angle', sql`${table.lightAngle} BETWEEN 1 AND 360`),
    check(
      'tokens_sight_range',
      sql`(${table.sightBright} IS NULL AND ${table.sightDim} IS NULL) OR (${table.sightBright} IS NOT NULL AND ${table.sightDim} IS NOT NULL AND ${table.sightBright} BETWEEN 0 AND 100 AND ${table.sightDim} BETWEEN 0 AND 100)`,
    ),
    check(
      'tokens_light_range',
      sql`(${table.lightBright} IS NULL AND ${table.lightDim} IS NULL) OR (${table.lightBright} IS NOT NULL AND ${table.lightDim} IS NOT NULL AND ${table.lightBright} BETWEEN 0 AND 100 AND ${table.lightDim} BETWEEN 0 AND 100)`,
    ),
    check(
      'tokens_light_color',
      sql`${table.lightColor} IS NULL OR ${table.lightBright} IS NOT NULL`,
    ),
    // The aura rules, shared with the character (token-columns.po.ts).
    check('tokens_aura_shape', auraShapeSql(table)),
    check('tokens_aura_fields', auraFieldsSql(table)),
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
    ...barColumns(),
  },
  (table) => [unique('token_bars_token_id_position_unique').on(table.tokenId, table.position)],
);

// The named forms of a token (a linked one keeps them on its anchor): the image and the size it
// takes when switched to, position 0 the base. Losing the asset brings the initials back.
export const tokenForms = pgTable(
  'token_forms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenId: uuid('token_id')
      .notNull()
      .references(() => tokens.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    name: text('name').notNull(),
    imageAssetId: uuid('image_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    width: doublePrecision('width').notNull(),
    height: doublePrecision('height').notNull(),
    frame: tokenFrame('frame').notNull().default('square'),
  },
  (table) => [
    unique('token_forms_token_id_position_unique').on(table.tokenId, table.position),
    check('token_forms_size_half_cells', halfCellSizeSql(table.width, table.height)),
  ],
);

export type TokenPo = typeof tokens.$inferSelect;
export type NewTokenPo = typeof tokens.$inferInsert;
export type TokenBarPo = typeof tokenBars.$inferSelect;
export type TokenBarInputPo = Omit<typeof tokenBars.$inferInsert, 'id' | 'tokenId' | 'position'>;
export type TokenFormPo = typeof tokenForms.$inferSelect;
/** A form as a write sends it, in list order; `id` is kept only when the token already has it. */
export type TokenFormInputPo = Pick<
  TokenFormPo,
  'id' | 'name' | 'imageAssetId' | 'width' | 'height' | 'frame'
>;
export type BarValuesPo = Pick<TokenBarPo, 'current' | 'max'>;
export type TokenLayerPo = TokenPo['layer'];
export type TokenLookPo = Pick<TokenPo, 'imageAssetId' | 'frame' | 'flipX' | 'flipY'>;
/** The seven aura columns, written always together (all null = no aura). */
export type TokenAuraPo = Pick<
  TokenPo,
  | 'auraKind'
  | 'auraRadius'
  | 'auraColor'
  | 'auraEffect'
  | 'auraImageAssetId'
  | 'auraOpacity'
  | 'auraImageShape'
>;
/** What `token:restyleMany` saves: the look, the defeat mark and the light switch (which
 *  `token:update` never sends) and the aura; `activeFormId` only from a form switch. */
export type TokenStylePo = TokenLookPo &
  Pick<TokenPo, 'defeated' | 'lightLit'> &
  TokenAuraPo &
  Partial<Pick<TokenPo, 'activeFormId'>>;
export type TokenSightPo = Pick<TokenPo, 'sightBright' | 'sightDim'>;
export type TokenLightPo = Pick<TokenPo, 'lightBright' | 'lightDim' | 'lightColor' | 'lightAngle'>;
/** What `token:update` saves; an absent look field keeps what the token has. */
export type TokenFieldsPo = Pick<TokenPo, 'name' | 'initials' | 'side' | 'width' | 'height'> &
  Partial<TokenLookPo> &
  Partial<TokenSightPo> &
  Partial<TokenLightPo> &
  Partial<TokenAuraPo> &
  Partial<Pick<TokenPo, 'sightAngle' | 'activeFormId'>>;
