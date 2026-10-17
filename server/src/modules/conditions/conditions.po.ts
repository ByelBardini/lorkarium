import { sql } from 'drizzle-orm';
import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { campaigns } from '../campaigns/campaigns.po';
import { tokens } from '../tokens/tokens.po';

export const conditionTone = pgEnum('condition_tone', ['benefit', 'harm']);

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
    tokenId: uuid('token_id')
      .notNull()
      .references(() => tokens.id, { onDelete: 'cascade' }),
    conditionId: uuid('condition_id')
      .notNull()
      .references(() => conditionDefinitions.id, { onDelete: 'cascade' }),
    remainingRounds: integer('remaining_rounds'),
    // The combat round it was applied in (null out of combat): that round's turn end skips it.
    appliedRound: integer('applied_round'),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('active_conditions_token_condition_unique').on(table.tokenId, table.conditionId),
  ],
);

export type ConditionDefinitionPo = typeof conditionDefinitions.$inferSelect;
export type ConditionToneValue = ConditionDefinitionPo['tone'];
export type NewConditionDefinition = Readonly<{ name: string; tone: ConditionToneValue }>;
export type ActiveConditionPo = typeof activeConditions.$inferSelect;
