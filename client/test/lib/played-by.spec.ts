import { describe, expect, it } from 'vitest';
import { playedByText } from '@/lib/played-by';
import { ANA_AT_TABLE, BIA_AT_TABLE, CAIO_AT_TABLE } from '../support/table-session-fixtures';

const MEMBERS = [ANA_AT_TABLE, BIA_AT_TABLE, CAIO_AT_TABLE];

describe('playedByText', () => {
  it('a token Bia controls reads "jogado por Bia"', () => {
    expect(playedByText({ controllerIds: [BIA_AT_TABLE.userId] }, MEMBERS)).toBe('jogado por Bia');
  });

  it('two controllers are joined by "e"', () => {
    const both = { controllerIds: [BIA_AT_TABLE.userId, CAIO_AT_TABLE.userId] };

    expect(playedByText(both, MEMBERS)).toBe('jogado por Bia e Caio');
  });

  it.each([[[]], [['someone-gone']]])('no controller at the table (%j) reads "NPC"', (ids) => {
    expect(playedByText({ controllerIds: ids }, MEMBERS)).toBe('NPC');
  });
});
