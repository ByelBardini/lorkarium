import { index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth/users.po';
import { scenes } from '../scenes/scenes.po';
import { tokens } from './tokens.po';

// The token a person's dock shows when nothing is selected. Per scene, because the token is of the
// scene (there is no reusable Character of spec §6 yet).
export const mainTokens = pgTable(
  'main_tokens',
  {
    sceneId: uuid('scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenId: uuid('token_id')
      .notNull()
      .references(() => tokens.id, { onDelete: 'cascade' }),
    chosenAt: timestamp('chosen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.sceneId, table.userId] }),
    index('main_tokens_token_id_idx').on(table.tokenId),
  ],
);

export type MainTokenPo = typeof mainTokens.$inferSelect;
