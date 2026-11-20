import { createPrivateKey } from 'node:crypto';
import { z } from 'zod';

/** The variables of the GitHub App that opens the feedback issues: all three or none. */
export const GITHUB_APP_KEYS = [
  'GITHUB_APP_ID',
  'GITHUB_APP_INSTALLATION_ID',
  'GITHUB_APP_PRIVATE_KEY',
] as const;

export const GITHUB_ISSUES_REPOSITORY_KEY = 'GITHUB_ISSUES_REPOSITORY';
export const DEFAULT_GITHUB_ISSUES_REPOSITORY = 'ByelBardini/lorkarium';

/** The App that opens issues on one repository (`owner/name`), with its private key (PEM). */
export type GitHubAppConfig = Readonly<{
  appId: string;
  installationId: string;
  privateKey: string;
  owner: string;
  repository: string;
}>;

const NUMERIC_ID = z.string().regex(/^\d+$/, { error: 'must be the numeric id GitHub shows' });

// A panel that keeps one line per variable stores the PEM with literal `\n`; both forms work.
const PRIVATE_KEY = z
  .string()
  .transform((value) => value.replaceAll('\\n', '\n').trim())
  .refine(isPrivateKey, {
    error: 'must be the App private key in PEM (-----BEGIN RSA PRIVATE KEY-----…)',
  });

const REPOSITORY = z
  .string()
  .regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/, {
    error: 'must be owner/name (ByelBardini/lorkarium)',
  })
  .default(DEFAULT_GITHUB_ISSUES_REPOSITORY);

/** The schema fields `envSchema` spreads in. */
export const githubEnvShape = {
  GITHUB_APP_ID: NUMERIC_ID.optional(),
  GITHUB_APP_INSTALLATION_ID: NUMERIC_ID.optional(),
  GITHUB_APP_PRIVATE_KEY: PRIVATE_KEY.optional(),
  GITHUB_ISSUES_REPOSITORY: REPOSITORY,
};

type GitHubVariables = Partial<Record<(typeof GITHUB_APP_KEYS)[number], string | undefined>>;

/** Half an App is a typo, not a choice: one variable set asks for the other two. Production may
 *  run with none (the queue works, publishing answers 503).
 *
 *  Example: `envSchema.superRefine(requireGitHubAppTrio)` */
export function requireGitHubAppTrio(env: GitHubVariables, ctx: z.RefinementCtx): void {
  if (GITHUB_APP_KEYS.every((key) => env[key] === undefined)) return;
  for (const key of GITHUB_APP_KEYS) {
    if (env[key] !== undefined) continue;
    ctx.addIssue({
      code: 'custom',
      path: [key],
      message: 'is required with the other GITHUB_APP_* variables',
    });
  }
}

/** Example: `toGitHubAppConfig(parsed)?.owner // 'ByelBardini'` */
export function toGitHubAppConfig(
  parsed: GitHubVariables & Readonly<{ GITHUB_ISSUES_REPOSITORY: string }>,
): GitHubAppConfig | null {
  const { GITHUB_APP_ID: appId, GITHUB_APP_INSTALLATION_ID: installationId } = parsed;
  const privateKey = parsed.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !installationId || !privateKey) return null;
  const [owner = '', repository = ''] = parsed.GITHUB_ISSUES_REPOSITORY.split('/');
  return { appId, installationId, privateKey, owner, repository };
}

function isPrivateKey(pem: string): boolean {
  try {
    return createPrivateKey(pem).asymmetricKeyType === 'rsa';
  } catch {
    return false;
  }
}
