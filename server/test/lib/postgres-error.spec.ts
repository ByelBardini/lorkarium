import { describe, expect, it } from 'vitest';
import {
  isForeignKeyViolation,
  isUniqueViolation,
  postgresFailureOf,
} from '../../src/lib/postgres-error';

function wrapped(cause: object): Error {
  return new Error('Failed query', { cause });
}

describe('postgresFailureOf', () => {
  it('reads the code and the constraint under the Drizzle wrapper', () => {
    const error = wrapped({ code: '23505', constraint: 'users_username_unique' });
    expect(postgresFailureOf(error)).toEqual({
      code: '23505',
      constraint: 'users_username_unique',
    });
  });

  it('reads a bare driver error too', () => {
    const error = Object.assign(new Error('duplicate'), { code: '23503' });
    expect(postgresFailureOf(error)).toEqual({ code: '23503', constraint: undefined });
  });

  it.each([['a string'], [null], [new Error('no code')]])('%o is no Postgres failure', (value) => {
    expect(postgresFailureOf(value)).toBeUndefined();
  });
});

describe('isUniqueViolation', () => {
  const username = wrapped({ code: '23505', constraint: 'users_username_unique' });

  it('any unique index counts without a constraint', () => {
    expect(isUniqueViolation(username)).toBe(true);
  });

  it('with a constraint, only that index counts', () => {
    expect(isUniqueViolation(username, 'users_username_unique')).toBe(true);
    expect(isUniqueViolation(username, 'users_email_index_unique')).toBe(false);
  });

  it('a foreign key failure is no unique violation', () => {
    expect(isUniqueViolation(wrapped({ code: '23503' }))).toBe(false);
  });
});

describe('isForeignKeyViolation', () => {
  it('23503 is a foreign key violation and 23505 is not', () => {
    expect(isForeignKeyViolation(wrapped({ code: '23503' }))).toBe(true);
    expect(isForeignKeyViolation(wrapped({ code: '23505' }))).toBe(false);
  });
});
