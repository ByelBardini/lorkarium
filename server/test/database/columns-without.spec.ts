import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { columnsWithout } from '../../src/database/columns-without';
import { tokenSheets } from '../../src/modules/sheets/sheets.po';

describe('columnsWithout', () => {
  it('keeps every column of the table but the ones left out', () => {
    const all = getTableColumns(tokenSheets);

    const listed = columnsWithout(all, 'values');

    expect(Object.keys(listed)).toEqual(Object.keys(all).filter((name) => name !== 'values'));
    expect(listed.name).toBe(all.name);
  });

  it('leaves several out at once and keeps the columns as they are', () => {
    const listed = columnsWithout(getTableColumns(tokenSheets), 'values', 'createdAt');

    expect(Object.keys(listed)).not.toContain('values');
    expect(Object.keys(listed)).not.toContain('createdAt');
    expect(listed.id).toBe(tokenSheets.id);
  });
});
