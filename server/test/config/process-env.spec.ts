import { afterEach, describe, expect, it, vi } from 'vitest';
import { readProcessEnv } from '../../src/config/process-env';

describe('readProcessEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('a variable exported in the shell is visible to the caller', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(readProcessEnv().NODE_ENV).toBe('production');
  });
});
