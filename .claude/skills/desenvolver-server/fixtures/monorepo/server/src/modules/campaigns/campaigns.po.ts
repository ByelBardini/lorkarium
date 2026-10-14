import { pgTable, text, uuid } from 'drizzle-orm/pg-core';

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id').notNull(),
  name: text('name').notNull(),
});

export type CampaignPo = typeof campaigns.$inferSelect;
export type NewCampaignPo = typeof campaigns.$inferInsert;
