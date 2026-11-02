import { describe, expect, it } from 'vitest';
import { workerDatabaseUrl } from './worker-database';

describe('workerDatabaseUrl', () => {
  it('appends the pool to the database name and keeps the rest of the address', () => {
    expect(workerDatabaseUrl('postgres://u:p@localhost:5432/lorkarium', '3')).toBe(
      'postgres://u:p@localhost:5432/lorkarium_worker_3',
    );
  });

  it('gives two workers two databases', () => {
    const base = 'postgres://u:p@localhost:5432/lorkarium';
    expect(workerDatabaseUrl(base, '1')).not.toBe(workerDatabaseUrl(base, '2'));
  });

  it('refuses a pool id that could not be part of a database name', () => {
    expect(() => workerDatabaseUrl('postgres://u:p@h/db', 'x"; DROP')).toThrow('x"; DROP');
  });
});
