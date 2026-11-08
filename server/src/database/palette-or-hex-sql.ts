import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

// A name is written into the CHECK as a literal, so it may never carry a quote.
const PALETTE_NAME = /^[a-z][a-z0-9_]*$/;

/** The CHECK of a color column kept as text: a name of the palette or a normalized `#rrggbb`, the
 *  same guarantee the enum gave plus `hexColorDto`. A NULL passes, as in any CHECK: a column that
 *  must have a color also says `.notNull()`.
 *
 *  Example: `check('drawings_stroke_color', paletteOrHexSql(table.stroke, DRAWING_PALETTE))` */
export function paletteOrHexSql(column: AnyPgColumn, palette: readonly string[]): SQL {
  const names = palette.map(quotedPaletteName).join(', ');
  return sql`${column} IN (${sql.raw(names)}) OR ${column} ~ '^#[0-9a-f]{6}$'`;
}

function quotedPaletteName(name: string): string {
  if (!PALETTE_NAME.test(name)) {
    throw new Error(`palette name ${name}: expected lowercase letters, digits or underscores`);
  }
  return `'${name}'`;
}
