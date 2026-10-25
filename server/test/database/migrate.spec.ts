import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsFolderOf } from '../../src/database/migrate';

describe('migrationsFolderOf', () => {
  // The bundle runs from server/dist, tsx from server/src: both sit beside server/drizzle.
  it.each(['/app/server/dist', '/app/server/src'])(
    'from %s it is the drizzle folder beside it',
    (directory) => {
      expect(migrationsFolderOf(directory)).toBe(path.resolve('/app/server/drizzle'));
    },
  );
});
