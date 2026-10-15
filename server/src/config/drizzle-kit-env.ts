import { existsSync } from 'node:fs';

export type DrizzleKitCredentials = { dbCredentials: { url: string } } | Record<string, never>;

/** Database credentials for drizzle-kit, which runs outside the app: `generate` needs none,
 *  `migrate` needs DATABASE_URL. A variable exported in the shell wins over `.env`
 *  (the disposable test Postgres relies on it).
 *
 *  Example: `defineConfig({ dialect: 'postgresql', ...readDrizzleKitCredentials() })` */
export function readDrizzleKitCredentials(): DrizzleKitCredentials {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const url = process.env.DATABASE_URL;
  return url ? { dbCredentials: { url } } : {};
}
