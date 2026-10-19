import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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

// Spec §6 Combatant: an initiative entry of 0 to N tokens (`combatant_tokens`); `tie_order` is the
// order of entry, swapped by the master within a tie.
export const combatants = pgTable('combatants', {
  id: uuid('id').primaryKey().defaultRandom(),
  combatId: uuid('combat_id')
    .notNull()
    .references(() => combats.id, { onDelete: 'cascade' }),
  // The name the master gave; `null` = the screen names the entry after its tokens.
  name: text('name'),
  initiative: integer('initiative'),
  tieOrder: integer('tie_order').notNull(),
});

// Spec §6 CombatantToken: the primary key on the token keeps it in at most one entry (a scene has
// one combat, a token one scene).
export const combatantTokens = pgTable(
  'combatant_tokens',
  {
    tokenId: uuid('token_id')
      .primaryKey()
      .references(() => tokens.id, { onDelete: 'cascade' }),
    combatantId: uuid('combatant_id')
      .notNull()
      .references(() => combatants.id, { onDelete: 'cascade' }),
  },
  (table) => [index('combatant_tokens_combatant_idx').on(table.combatantId)],
);

export type CombatPo = typeof combats.$inferSelect;
export type CombatantPo = typeof combatants.$inferSelect;
