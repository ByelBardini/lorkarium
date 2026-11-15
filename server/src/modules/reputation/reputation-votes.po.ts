import { sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, smallint, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';

// One vote per pair, changeable and removable; the voter only from a shared table (the BO).
export const reputationVotes = pgTable(
  'reputation_votes',
  {
    voterId: uuid('voter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    value: smallint('value').$type<1 | -1>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.voterId, table.targetId] }),
    // Every card counts the votes on its account.
    index('reputation_votes_target_idx').on(table.targetId),
    check('reputation_votes_value', sql`${table.value} in (-1, 1)`),
    check('reputation_votes_not_self', sql`${table.voterId} <> ${table.targetId}`),
  ],
);

export type ReputationVotePo = typeof reputationVotes.$inferSelect;
export type ReputationVoteValuePo = ReputationVotePo['value'];
