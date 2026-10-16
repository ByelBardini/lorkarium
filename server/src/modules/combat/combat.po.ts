import { integer, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { scenes } from '../scenes/scenes.po';
import { tokens } from '../tokens/tokens.po';

// Spec §6 Combat: at most one per scene (the unique scene_id).
export const combats = pgTable('combats', {
  id: uuid('id').primaryKey().defaultRandom(),
  sceneId: uuid('scene_id')
    .notNull()
    .unique()
    .references(() => scenes.id, { onDelete: 'cascade' }),
  round: integer('round').notNull().default(1),
  // No foreign key: the service moves the turn before a combatant leaves, in the same transaction.
  currentCombatantId: uuid('current_combatant_id'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
});

// Spec §6 Combatant; `tie_order` is the order of entry, swapped by the master within a tie.
export const combatants = pgTable(
  'combatants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    combatId: uuid('combat_id')
      .notNull()
      .references(() => combats.id, { onDelete: 'cascade' }),
    tokenId: uuid('token_id')
      .notNull()
      .references(() => tokens.id, { onDelete: 'cascade' }),
    initiative: integer('initiative'),
    tieOrder: integer('tie_order').notNull(),
  },
  (table) => [unique('combatants_combat_token_unique').on(table.combatId, table.tokenId)],
);

export type CombatPo = typeof combats.$inferSelect;
export type CombatantPo = typeof combatants.$inferSelect;
