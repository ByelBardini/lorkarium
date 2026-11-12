import { PgDialect, pgTable, text } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  lorkariumOwnerSql,
  ownerUsernameStartupOptions,
} from '../../src/database/lorkarium-owner-sql';

const accounts = pgTable('accounts', { username: text('username') });

describe('lorkariumOwnerSql', () => {
  it('compares the @ column with the connection setting, false when the setting is missing', () => {
    const rendered = new PgDialect().sqlToQuery(lorkariumOwnerSql(accounts.username)).sql;
    expect(rendered).toBe(
      `coalesce("accounts"."username" = current_setting('lorkarium.owner_username', true), false)`,
    );
  });
});

describe('ownerUsernameStartupOptions', () => {
  it('no @ sends no startup option, so nobody is the Dono', () => {
    expect(ownerUsernameStartupOptions(null)).toBeUndefined();
  });

  it('an @ becomes the -c option of every new connection', () => {
    expect(ownerUsernameStartupOptions('byel')).toBe('-c lorkarium.owner_username=byel');
  });

  it('an @ out of the format is refused citing it, never written into the option', () => {
    expect(() => ownerUsernameStartupOptions('byel -c x=1')).toThrow(/"byel -c x=1".*a-z 0-9 \. _/);
  });
});
