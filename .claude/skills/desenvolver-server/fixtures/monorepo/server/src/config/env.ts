import { z } from 'zod';

const envSchema = z.strictObject({ DATABASE_URL: z.string().min(1) });

export type Env = z.infer<typeof envSchema>;

/** The validated environment; refuses to boot without DATABASE_URL.
 *
 *  Example: `readEnv(process.env).DATABASE_URL` */
export function readEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse({ DATABASE_URL: source.DATABASE_URL });
}
