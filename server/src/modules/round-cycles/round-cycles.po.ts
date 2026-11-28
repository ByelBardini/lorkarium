import { sql } from 'drizzle-orm';
import type { ConditionIconDto } from '@lorkarium/contracts';
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { assets } from '../assets/assets.po';
import { users } from '../auth/users.po';
import { campaigns } from '../campaigns/campaigns.po';
import { characters } from '../characters/characters.po';
import { combats } from '../combat/combat.po';
import { tokens } from '../tokens/tokens.po';

export const roundCycleVisibility = pgEnum('round_cycle_visibility', [
  'everyone',
  'some',
  'masters',
]);

// Spec §3.16: a sequence of phases that turns at every round of a combat. Both holders null = a
// cycle of the table (every combat); deleting the holder deletes the cycle.
export const roundCycles = pgTable(
  'round_cycles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    visibility: roundCycleVisibility('visibility').notNull(),
    // The phase goes to everyone in the grid at every turn, whatever `visibility` says.
    announce: boolean('announce').notNull().default(false),
    holderCharacterId: uuid('holder_character_id').references(() => characters.id, {
      onDelete: 'cascade',
    }),
    holderTokenId: uuid('holder_token_id').references(() => tokens.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('round_cycles_campaign_idx').on(table.campaignId),
    // Deleting a token or a character finds its cycle (the cascade) without scanning the table.
    index('round_cycles_holder_character_idx')
      .on(table.holderCharacterId)
      .where(sql`${table.holderCharacterId} IS NOT NULL`),
    index('round_cycles_holder_token_idx')
      .on(table.holderTokenId)
      .where(sql`${table.holderTokenId} IS NOT NULL`),
    check(
      'round_cycles_one_holder',
      sql`${table.holderCharacterId} IS NULL OR ${table.holderTokenId} IS NULL`,
    ),
  ],
);

export const roundCyclePhases = pgTable(
  'round_cycle_phases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cycleId: uuid('cycle_id')
      .notNull()
      .references(() => roundCycles.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    name: text('name').notNull(),
    // Text, not a pg enum: the closed list is the condition icons of the contract. The default
    // is what the phases saved before the icon got.
    icon: text('icon').$type<ConditionIconDto>().notNull().default('game-icons:cycle'),
    // An image of the table in place of the icon (a plan feature); losing the asset (set null)
    // leaves the phase with its icon.
    imageAssetId: uuid('image_asset_id').references(() => assets.id, { onDelete: 'set null' }),
  },
  // No unique (cycle, position): a reorder rewrites the positions row by row.
  (table) => [index('round_cycle_phases_cycle_idx').on(table.cycleId, table.position)],
);

// Who sees (`some`) and who may choose the next phase; choosing implies seeing.
export const roundCycleMembers = pgTable(
  'round_cycle_members',
  {
    cycleId: uuid('cycle_id')
      .notNull()
      .references(() => roundCycles.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    canSee: boolean('can_see').notNull(),
    canChoose: boolean('can_choose').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.cycleId, table.userId] }),
    index('round_cycle_members_user_idx').on(table.userId),
    check('round_cycle_members_choose_sees', sql`NOT ${table.canChoose} OR ${table.canSee}`),
  ],
);

// Where a cycle stands in one combat. A deleted phase leaves null: the next turn restarts the
// cycle at its first phase (game-core `turnCycle`).
export const combatRoundCycles = pgTable(
  'combat_round_cycles',
  {
    combatId: uuid('combat_id')
      .notNull()
      .references(() => combats.id, { onDelete: 'cascade' }),
    cycleId: uuid('cycle_id')
      .notNull()
      .references(() => roundCycles.id, { onDelete: 'cascade' }),
    currentPhaseId: uuid('current_phase_id').references(() => roundCyclePhases.id, {
      onDelete: 'set null',
    }),
    chosenPhaseId: uuid('chosen_phase_id').references(() => roundCyclePhases.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    primaryKey({ columns: [table.combatId, table.cycleId] }),
    index('combat_round_cycles_cycle_idx').on(table.cycleId),
  ],
);

export type RoundCyclePo = typeof roundCycles.$inferSelect;
export type RoundCyclePhasePo = typeof roundCyclePhases.$inferSelect;
export type RoundCycleMemberPo = typeof roundCycleMembers.$inferSelect;
export type CombatRoundCyclePo = typeof combatRoundCycles.$inferSelect;
export type RoundCycleVisibilityValue = RoundCyclePo['visibility'];
