/** The raw process environment, for a composition root other than `src/index.ts` (the dev seed):
 *  `process.env` is read only under `src/config/`.
 *
 *  Example: `readEnv(readProcessEnv()).nodeEnv // 'development'` */
export function readProcessEnv(): Record<string, string | undefined> {
  return process.env;
}
