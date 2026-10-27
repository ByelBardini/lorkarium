import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
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
    // An admin in juggernaut mode (docs/context/campaigns/papeis.md): not null = on, since then.
    juggernautSince: timestamp('juggernaut_since', { withTimezone: true }),
    // The role to go back to when the mode ends; null with the mode on = not a member before.
    roleBeforeJuggernaut: campaignRole('role_before_juggernaut'),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.userId] }),
    index('campaign_members_user_id_idx').on(table.userId),
    check(
      'campaign_members_juggernaut_is_master',
      sql`${table.juggernautSince} is null or ${table.role} = 'master'`,
    ),
    check(
      'campaign_members_role_before_needs_juggernaut',
      sql`${table.roleBeforeJuggernaut} is null or ${table.juggernautSince} is not null`,
    ),
  ],
);

export type CampaignMemberPo = typeof campaignMembers.$inferSelect;
export type NewCampaignMemberPo = typeof campaignMembers.$inferInsert;
