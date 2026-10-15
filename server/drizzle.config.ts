import { defineConfig } from 'drizzle-kit';
import { readDrizzleKitCredentials } from './src/config/drizzle-kit-env';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './drizzle',
  ...readDrizzleKitCredentials(),
});
