import { PgDialect, pgTable, text } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { paletteOrHexSql } from '../../src/database/palette-or-hex-sql';

const banners = pgTable('banners', { tint: text('tint') });

function rendered(palette: readonly [string, ...string[]]): string {
  return new PgDialect().sqlToQuery(paletteOrHexSql(banners.tint, palette)).sql;
}

describe('paletteOrHexSql', () => {
  it('accepts the names of the palette or a normalized hex on the column it was given', () => {
    expect(rendered(['gold', 'steel'])).toBe(
      `"banners"."tint" IN ('gold', 'steel') OR "banners"."tint" ~ '^#[0-9a-f]{6}$'`,
    );
  });

  it('a palette of one name is still a list', () => {
    expect(rendered(['gold'])).toContain(`IN ('gold')`);
  });

  it('a name that could break out of the quotes throws citing it and the expected shape', () => {
    expect(() => rendered(['gold', "x') OR ('1"])).toThrow(/x'\) OR \('1.*lowercase/);
  });
});
