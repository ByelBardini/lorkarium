import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type PgTableExtraConfigValue,
} from 'drizzle-orm/pg-core';
import { assets } from '../assets/assets.po';
import { users } from '../auth/users.po';
import { campaigns } from '../campaigns/campaigns.po';
import { tokenSheets } from '../sheets/sheets.po';
import {
  auraColumns,
  auraFieldsSql,
  auraShapeSql,
  barColumns,
  boxSizeColumns,
  halfCellSizeSql,
  tokenFrame,
  tokenSide,
} from '../tokens/token-columns.po';

// Spec §6 Character: the table's own entity behind the tokens linked to it (the Actor of the
// Foundry). It holds what every linked token shares; the token keeps what is per grid.
export const characters = pgTable(
  'characters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    // Set null, never a key to campaign_members: leaving the table keeps the character (its bars,
    // sheets and tokens on the map) for the master; null = nobody's.
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    initials: text('initials').notNull(),
    side: tokenSide('side').notNull(),
    imageAssetId: uuid('image_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    frame: tokenFrame('frame').notNull().default('square'),
    defeated: boolean('defeated').notNull().default(false),
    ...auraColumns(),
    // The size a new linked token takes ("Adicionar jogadores"); each token keeps its own.
    ...boxSizeColumns(),
    armorClass: smallint('armor_class'),
    difficultyClass: smallint('difficulty_class'),
    noteOne: text('note_one'),
    noteTwo: text('note_two'),
    // The sheet the card and the dock open in one click; losing it leaves none.
    mainSheetId: uuid('main_sheet_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table): PgTableExtraConfigValue[] => [
    unique('characters_campaign_id_id_unique').on(table.campaignId, table.id),
    // One character per player per table (several, or the master's NPCs, are out of scope).
    uniqueIndex('characters_campaign_user_unique')
      .on(table.campaignId, table.userId)
      .where(sql`${table.userId} IS NOT NULL`),
    // The migration narrows it to SET NULL ("main_sheet_id"): a plain set null would also null
    // the campaign_id (the 0033 trap, docs/context/library.md).
    foreignKey({
      name: 'characters_main_sheet_fk',
      columns: [table.campaignId, table.mainSheetId],
      foreignColumns: [tokenSheets.campaignId, tokenSheets.id],
    }).onDelete('set null'),
    // 60 = the contract's CHARACTER_NAME_MAX (the name the linked tokens wear).
    check('characters_name_length', sql`char_length(${table.name}) BETWEEN 1 AND 60`),
    check('characters_note_one_length', sql`char_length(${table.noteOne}) <= 80`),
    check('characters_note_two_length', sql`char_length(${table.noteTwo}) <= 80`),
    check('characters_armor_class_range', sql`${table.armorClass} BETWEEN 0 AND 999`),
    check('characters_difficulty_class_range', sql`${table.difficultyClass} BETWEEN 0 AND 999`),
    check('characters_aura_shape', auraShapeSql(table)),
    check('characters_aura_fields', auraFieldsSql(table)),
    check('characters_size_half_cells', halfCellSizeSql(table.width, table.height)),
  ],
);

// The bars of a character, as `token_bars` has them for a loose token.
export const characterBars = pgTable(
  'character_bars',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    ...barColumns(),
  },
  (table) => [
    unique('character_bars_character_id_position_unique').on(table.characterId, table.position),
  ],
);

// Who moves the character's tokens and touches its bars (its player, and whoever the master adds).
export const characterControllers = pgTable(
  'character_controllers',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.characterId, table.userId] })],
);

export type CharacterPo = typeof characters.$inferSelect;
export type NewCharacterPo = typeof characters.$inferInsert;
export type CharacterBarPo = typeof characterBars.$inferSelect;
export type CharacterControllerPo = typeof characterControllers.$inferSelect;

/** One bar to write on a character: its position is its place in the list written. */
export type CharacterBarInputPo = Omit<
  typeof characterBars.$inferInsert,
  'id' | 'characterId' | 'position'
>;

/** The card fields one update writes: an absent key stays, `null` clears. */
export type CharacterChangesPo = Partial<
  Pick<CharacterPo, 'name' | 'armorClass' | 'difficultyClass' | 'noteOne' | 'noteTwo'>
>;
