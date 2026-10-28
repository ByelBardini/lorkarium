import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  numeric,
  pgEnum,
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
import { drawingColor } from '../drawings/drawings.po';
import { lightColorEnum } from '../lights/lights.po';
import { scenes } from '../scenes/scenes.po';

export const tokenSide = pgEnum('token_side', ['ally', 'enemy', 'neutral']);
// The order is the drawing order, top to bottom (`tokenLayerDto`).
export const tokenLayer = pgEnum('token_layer', ['tokens', 'objects', 'background']);
export const barColor = pgEnum('bar_color', ['gold', 'steel', 'ember', 'moss', 'ash']);
export const barVisibility = pgEnum('bar_visibility', ['everyone', 'controllers']);
export const barDisplay = pgEnum('bar_display', ['number', 'percent']);
export const tokenFrame = pgEnum('token_frame', ['square', 'round']);
export const tokenAuraKind = pgEnum('token_aura_kind', ['color', 'effect', 'image']);
// The order of the contract's `AURA_EFFECTS`.
export const auraEffect = pgEnum('aura_effect', [
  'fire',
  'water',
  'lightning',
  'frost',
  'radiant',
  'shadow',
  'poison',
  'arcane',
]);

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
    // The one aura around the token, seen by everyone: all seven null = none. `aura_radius` is in
    // cells past the token's edge (game-core `auraRadius`); an effect without a color is drawn
    // in its natural tone. Losing the image asset keeps the rest (the mapper reads it as none).
    auraKind: tokenAuraKind('aura_kind'),
    auraRadius: numeric('aura_radius', { precision: 6, scale: 2 }),
    auraColor: drawingColor('aura_color'),
    auraEffect: auraEffect('aura_effect'),
    auraImageAssetId: uuid('aura_image_asset_id').references(() => assets.id, {
      onDelete: 'set null',
    }),
    auraOpacity: smallint('aura_opacity'),
    // How an image aura is cut (the token frame's values): only and always on an image aura.
    auraImageShape: tokenFrame('aura_image_shape'),
    // Hidden from the players: only the masters and its controllers ever receive it.
    hidden: boolean('hidden').notNull().default(false),
    // The anchor (in the table's cast) of the character this token is: it lends its identity,
    // bars, controllers, conditions and defeat mark. Losing the anchor unlinks the token.
    anchorTokenId: uuid('anchor_token_id').references((): AnyPgColumn => tokens.id, {
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
    // All seven null, or a kind with its radius (0–20 cells, game-core `AURA_RADIUS_MAX`) and its
    // opacity (10–100 %). A CHECK passes on NULL, so the second branch names each as not null.
    check(
      'tokens_aura_shape',
      sql`(${table.auraKind} IS NULL AND ${table.auraRadius} IS NULL AND ${table.auraColor} IS NULL AND ${table.auraEffect} IS NULL AND ${table.auraImageAssetId} IS NULL AND ${table.auraOpacity} IS NULL AND ${table.auraImageShape} IS NULL) OR (${table.auraKind} IS NOT NULL AND ${table.auraRadius} IS NOT NULL AND ${table.auraOpacity} IS NOT NULL AND ${table.auraRadius} BETWEEN 0 AND 20 AND ${table.auraOpacity} BETWEEN 10 AND 100)`,
    ),
    // A color aura has its color; an effect aura has its effect (and maybe a color); only an
    // image aura has an image, which may be null after its asset is deleted (set null), and
    // its shape, which stays.
    check(
      'tokens_aura_fields',
      sql`(${table.auraKind} IS DISTINCT FROM 'color' OR ${table.auraColor} IS NOT NULL) AND ((${table.auraEffect} IS NOT NULL) = (${table.auraKind} IS NOT DISTINCT FROM 'effect')) AND (${table.auraColor} IS NULL OR ${table.auraKind} IS NOT DISTINCT FROM 'color' OR ${table.auraKind} IS NOT DISTINCT FROM 'effect') AND (${table.auraImageAssetId} IS NULL OR ${table.auraKind} IS NOT DISTINCT FROM 'image') AND ((${table.auraImageShape} IS NOT NULL) = (${table.auraKind} IS NOT DISTINCT FROM 'image'))`,
    ),
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
    display: barDisplay('display').notNull().default('number'),
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
    check(
      'token_forms_size_half_cells',
      sql`${table.width} BETWEEN 0.5 AND 10 AND ${table.height} BETWEEN 0.5 AND 10 AND (${table.width} * 2) = floor(${table.width} * 2) AND (${table.height} * 2) = floor(${table.height} * 2)`,
    ),
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
