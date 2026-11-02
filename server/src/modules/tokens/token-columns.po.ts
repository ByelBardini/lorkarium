import { sql, type SQL } from 'drizzle-orm';
import {
  doublePrecision,
  integer,
  numeric,
  pgEnum,
  smallint,
  text,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { assets } from '../assets/assets.po';
import { drawingColor } from '../drawings/drawings.po';

// The columns a token shares with a character, apart from tokens.po.ts because characters.po.ts
// uses them when it loads and tokens.po.ts imports characters.po.ts (tokens.character_id): from
// the same file, whichever loaded first would meet the other half-built
// (docs/context/characters.md, Armadilhas).
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

/** The seven aura columns of a table (a token, a character): all null = no aura.
 *
 *  Example: `pgTable('characters', { id: uuid('id'), ...auraColumns() })` */
export function auraColumns() {
  return {
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
  };
}

type AuraColumnsOf = Record<keyof ReturnType<typeof auraColumns>, AnyPgColumn>;

/** All seven null, or a kind with its radius (0–20 cells, game-core `AURA_RADIUS_MAX`) and its
 *  opacity (10–100 %). A CHECK passes on NULL, so the second branch names each as not null.
 *
 *  Example: `check('tokens_aura_shape', auraShapeSql(table))` */
export function auraShapeSql(table: AuraColumnsOf): SQL {
  return sql`(${table.auraKind} IS NULL AND ${table.auraRadius} IS NULL AND ${table.auraColor} IS NULL AND ${table.auraEffect} IS NULL AND ${table.auraImageAssetId} IS NULL AND ${table.auraOpacity} IS NULL AND ${table.auraImageShape} IS NULL) OR (${table.auraKind} IS NOT NULL AND ${table.auraRadius} IS NOT NULL AND ${table.auraOpacity} IS NOT NULL AND ${table.auraRadius} BETWEEN 0 AND 20 AND ${table.auraOpacity} BETWEEN 10 AND 100)`;
}

/** A color aura has its color; an effect aura has its effect (and maybe a color); only an image
 *  aura has an image, which may be null after its asset is deleted (set null), and its shape,
 *  which stays.
 *
 *  Example: `check('tokens_aura_fields', auraFieldsSql(table))` */
export function auraFieldsSql(table: AuraColumnsOf): SQL {
  return sql`(${table.auraKind} IS DISTINCT FROM 'color' OR ${table.auraColor} IS NOT NULL) AND ((${table.auraEffect} IS NOT NULL) = (${table.auraKind} IS NOT DISTINCT FROM 'effect')) AND (${table.auraColor} IS NULL OR ${table.auraKind} IS NOT DISTINCT FROM 'color' OR ${table.auraKind} IS NOT DISTINCT FROM 'effect') AND (${table.auraImageAssetId} IS NULL OR ${table.auraKind} IS NOT DISTINCT FROM 'image') AND ((${table.auraImageShape} IS NOT NULL) = (${table.auraKind} IS NOT DISTINCT FROM 'image'))`;
}

/** The columns of one bar (a token's, a character's) apart from its owner: position 0 is drawn on
 *  the token.
 *
 *  Example: `pgTable('character_bars', { id: uuid('id'), characterId: uuid('character_id'), ...barColumns() })` */
export function barColumns() {
  return {
    position: integer('position').notNull(),
    label: text('label').notNull(),
    current: integer('current').notNull(),
    max: integer('max').notNull(),
    color: barColor('color').notNull(),
    visibility: barVisibility('visibility').notNull(),
    display: barDisplay('display').notNull().default('number'),
  };
}

/** The width × height of a token box, in cells, in steps of half a cell (default 1 × 1).
 *
 *  Example: `pgTable('characters', { ...boxSizeColumns() })` */
export function boxSizeColumns() {
  return {
    width: doublePrecision('width').notNull().default(1),
    height: doublePrecision('height').notNull().default(1),
  };
}

/** A box side from half a cell to 10 cells, in steps of half a cell.
 *
 *  Example: `check('token_forms_size_half_cells', halfCellSizeSql(table.width, table.height))` */
export function halfCellSizeSql(width: AnyPgColumn, height: AnyPgColumn): SQL {
  return sql`${width} BETWEEN 0.5 AND 10 AND ${height} BETWEEN 0.5 AND 10 AND (${width} * 2) = floor(${width} * 2) AND (${height} * 2) = floor(${height} * 2)`;
}
