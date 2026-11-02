import type { ConditionColorDto, ConditionIconDto } from '@lorkarium/contracts';
import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { assets } from '../assets/assets.po';
import { campaigns } from '../campaigns/campaigns.po';
import { characters } from '../characters/characters.po';
import { tokens } from '../tokens/tokens.po';

export const conditionTone = pgEnum('condition_tone', ['benefit', 'harm', 'incapacitating']);
// How the condition changes the token itself on the board; null = it is only an icon.
export const conditionLook = pgEnum('condition_look', ['unconscious', 'invisible']);

// The table's own list (spec §3.7): seeded with generic names, the master adds more by name.
export const conditionDefinitions = pgTable(
  'condition_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tone: conditionTone('tone').notNull(),
    // Text, not a pg enum: the closed list lives in the contract, so adding an icon needs no migration.
    icon: text('icon').$type<ConditionIconDto>().notNull().default('circle-dot'),
    look: conditionLook('look'),
    // Text like `icon`: a key of the contract's closed palette; null = painted by its tone.
    color: text('color').$type<ConditionColorDto>(),
    // Free text from the master about what it does; '' = none. No rule reads it (spec §3.7).
    description: text('description').notNull().default(''),
    // How many times it piles up at most (2..99, the contract checks); null = it does not stack.
    maxStacks: integer('max_stacks'),
    // The master's image in place of the icon; null = only the icon. The icon stays saved as the
    // fallback, so losing the asset (set null) brings the icon back instead of losing the condition.
    imageAssetId: uuid('image_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('condition_definitions_campaign_name_unique').on(
      table.campaignId,
      sql`lower(${table.name})`,
    ),
  ],
);

// Spec §6 ActiveCondition; `remaining_rounds` null = until removed. One per condition per token.
export const activeConditions = pgTable(
  'active_conditions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Exactly one holder (CHECK active_conditions_one_holder): a loose token or a character.
    tokenId: uuid('token_id').references(() => tokens.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id').references(() => characters.id, { onDelete: 'cascade' }),
    conditionId: uuid('condition_id')
      .notNull()
      .references(() => conditionDefinitions.id, { onDelete: 'cascade' }),
    remainingRounds: integer('remaining_rounds'),
    // The combat round it was applied in (null out of combat): that round's turn end skips it.
    appliedRound: integer('applied_round'),
    // Always 1 on a condition that does not stack; every stack shares the one duration.
    stacks: integer('stacks').notNull().default(1),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('active_conditions_token_condition_unique').on(table.tokenId, table.conditionId),
    unique('active_conditions_character_condition_unique').on(table.characterId, table.conditionId),
    check(
      'active_conditions_one_holder',
      sql`(${table.tokenId} IS NULL) <> (${table.characterId} IS NULL)`,
    ),
  ],
);

export type ConditionDefinitionPo = typeof conditionDefinitions.$inferSelect;
export type ConditionToneValue = ConditionDefinitionPo['tone'];
export type NewConditionDefinition = Readonly<{
  name: string;
  tone: ConditionToneValue;
  icon: ConditionDefinitionPo['icon'];
  look: ConditionDefinitionPo['look'];
  color: ConditionDefinitionPo['color'];
  description: string;
  maxStacks: ConditionDefinitionPo['maxStacks'];
  imageAssetId: ConditionDefinitionPo['imageAssetId'];
}>;
export type ActiveConditionPo = typeof activeConditions.$inferSelect;

/** Who holds an active condition: an unlinked token, or the character a linked token wears (its
 *  conditions follow it to every grid). */
export type ConditionHolder = Readonly<{ tokenId: string }> | Readonly<{ characterId: string }>;

/** The id of a holder: its token's or its character's (both uuids, never the same).
 *
 *  Example: `holderIdOf({ characterId: lyraId }) // lyraId` */
export function holderIdOf(holder: ConditionHolder): string {
  return 'tokenId' in holder ? holder.tokenId : holder.characterId;
}

/** The id of the holder of a saved condition (`active_conditions_one_holder`: exactly one is set).
 *
 *  Example: `active.filter((row) => holderIdOfRow(row) === lyraId)` */
export function holderIdOfRow(
  row: Readonly<{ tokenId: string | null; characterId: string | null }>,
): string {
  const id = row.tokenId ?? row.characterId;
  if (id === null) throw new Error(`active condition with no holder: ${JSON.stringify(row)}`);
  return id;
}
