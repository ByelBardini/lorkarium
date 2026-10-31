import { sql } from 'drizzle-orm';
import { readEnv } from '../../src/config/env';
import {
  createDatabase,
  type Database,
  type DatabaseConnection,
  type DatabaseOptions,
} from '../../src/database/database';
import { runMigrations } from '../../src/database/migrate';

/** Connects to the disposable Postgres in DATABASE_URL (never the `pnpm db:up` one) and migrates it;
 *  a `queryLog` hears every statement after that, and the pool and timeouts of the env can be
 *  overridden (`poolMax: 2` to make the pool the bottleneck).
 *
 *  Example: `const connection = await openTestDatabase({ queryLog: queries }); afterAll(connection.close)` */
export async function openTestDatabase(options: DatabaseOptions = {}): Promise<DatabaseConnection> {
  const env = readEnv(process.env);
  const connection = createDatabase(env.databaseUrl, { ...env.database, ...options });
  await runMigrations(connection.db);
  return connection;
}

/** Empties every table so each spec starts from a blank database.
 *
 *  Example: `beforeEach(() => truncateAllTables(db))` */
export async function truncateAllTables(db: Database): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE token_sheets, sheet_actions, sheet_templates, library_documents, library_document_tabs, library_document_owners, library_document_assets, library_document_actions, users, auth_sessions, campaigns, campaign_members, scene_folders, library_images, library_image_presentations, scenes, tokens, token_controllers, token_bars, condition_definitions, active_conditions, combats, combatants, drawings, effect_areas, walls, lights, assets, main_tokens, member_cards, saved_rolls, email_change_requests, user_two_factor, recovery_codes, two_factor_challenges, account_recovery_tokens, invitations, password_resets RESTART IDENTITY CASCADE`,
  );
}
