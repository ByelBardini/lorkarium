import { index, pgEnum, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';
import { campaigns } from './campaigns.po';

// Per-campaign role (spec §3.9). The spectator is stored too, so a reload or a server restart
// keeps them at the table; the table itself shows no trace of them (docs/context/campaigns/papeis.md).
export const campaignRole = pgEnum('campaign_role', ['master', 'player', 'spectator']);

export const campaignMembers = pgTable(
  'campaign_members',
  {
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: campaignRole('role').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    // Feeds the home's "Continuar" band and the list order.
    lastEnteredAt: timestamp('last_entered_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.userId] }),
    index('campaign_members_user_id_idx').on(table.userId),
  ],
);

export type CampaignMemberPo = typeof campaignMembers.$inferSelect;
export type NewCampaignMemberPo = typeof campaignMembers.$inferInsert;
