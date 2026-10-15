import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';

export const campaignVisibility = pgEnum('campaign_visibility', ['public', 'private']);

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  system: text('system'),
  status: text('status'),
  description: text('description'),
  visibility: campaignVisibility('visibility').notNull().default('private'),
  // Canonical form (no hyphen, uppercase); the client formats it for display.
  joinCode: text('join_code').notNull().unique(),
  // Argon2id hash; `null` = the campaign asks for no password.
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CampaignPo = typeof campaigns.$inferSelect;
export type NewCampaignPo = typeof campaigns.$inferInsert;
