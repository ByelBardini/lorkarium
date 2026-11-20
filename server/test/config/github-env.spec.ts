import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { InvalidEnvError, readEnv } from '../../src/config/env';

const REQUIRED = {
  DATABASE_URL: 'postgres://lorkarium:lorkarium@localhost:5432/lorkarium',
  S3_ENDPOINT: 'http://localhost:8333',
  S3_BUCKET: 'lorkarium',
  S3_ACCESS_KEY_ID: 'lorkarium',
  S3_SECRET_ACCESS_KEY: 'lorkarium-dev-secret',
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
};
const PEM = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ type: 'pkcs1', format: 'pem' })
  .toString();
const APP = {
  GITHUB_APP_ID: '123456',
  GITHUB_APP_INSTALLATION_ID: '7890',
  GITHUB_APP_PRIVATE_KEY: PEM,
};

function problemsOf(source: Record<string, string>): readonly string[] {
  try {
    readEnv(source);
    return [];
  } catch (error) {
    return error instanceof InvalidEnvError ? error.problems : [String(error)];
  }
}

describe('readEnv, the GitHub App of the feedback', () => {
  it('without any of the three, the server runs with no tracker', () => {
    expect(readEnv(REQUIRED).issueTracker).toBeNull();
  });

  it('the three give the App on the default repository', () => {
    expect(readEnv({ ...REQUIRED, ...APP }).issueTracker).toEqual({
      appId: '123456',
      installationId: '7890',
      privateKey: PEM.trim(),
      owner: 'ByelBardini',
      repository: 'lorkarium',
    });
  });

  it('a PEM kept on one line with literal \\n is read as the same key', () => {
    const oneLine = PEM.trim().replaceAll('\n', '\\n');

    expect(
      readEnv({ ...REQUIRED, ...APP, GITHUB_APP_PRIVATE_KEY: oneLine }).issueTracker?.privateKey,
    ).toBe(PEM.trim());
  });

  it('two of the three are refused naming the missing one', () => {
    const two = {
      GITHUB_APP_ID: APP.GITHUB_APP_ID,
      GITHUB_APP_PRIVATE_KEY: APP.GITHUB_APP_PRIVATE_KEY,
    };

    expect(problemsOf({ ...REQUIRED, ...two })).toEqual([
      'GITHUB_APP_INSTALLATION_ID is required with the other GITHUB_APP_* variables (received nothing)',
    ]);
  });

  it('a key that is not a PEM is refused without echoing it', () => {
    const problems = problemsOf({
      ...REQUIRED,
      ...APP,
      GITHUB_APP_PRIVATE_KEY: 'segredo-qualquer',
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('GITHUB_APP_PRIVATE_KEY must be the App private key in PEM');
    expect(problems[0]).toContain('(received a redacted value)');
  });

  it('a repository that is not owner/name is refused citing it', () => {
    expect(problemsOf({ ...REQUIRED, ...APP, GITHUB_ISSUES_REPOSITORY: 'lorkarium' })).toEqual([
      'GITHUB_ISSUES_REPOSITORY must be owner/name (ByelBardini/lorkarium) (received "lorkarium")',
    ]);
  });

  it('an id that is not numeric is refused citing it', () => {
    expect(problemsOf({ ...REQUIRED, ...APP, GITHUB_APP_ID: 'lorkarium-bot' })).toEqual([
      'GITHUB_APP_ID must be the numeric id GitHub shows (received "lorkarium-bot")',
    ]);
  });
});
