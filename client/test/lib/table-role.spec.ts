import { describe, expect, it } from 'vitest';
import { playerIdsOf, toolsOf, watchesOnly } from '@/lib/table-role';
import { ANA_AT_TABLE, BIA_AT_TABLE, CAIO_AT_TABLE, duda } from '../support/table-session-fixtures';

describe('watchesOnly', () => {
  it.each([
    ['spectator', true],
    ['player', false],
    ['master', false],
  ] as const)('a %s watches only: %s', (role, watching) => {
    expect(watchesOnly(role)).toBe(watching);
  });
});

describe('toolsOf', () => {
  it('a spectator picks only Selecionar and the local ruler', () => {
    expect(toolsOf('spectator')).toEqual(['select', 'ruler']);
  });

  it('a player also draws, puts areas and stamps conditions, never walls nor lights', () => {
    expect(toolsOf('player')).toEqual(['select', 'ruler', 'draw', 'area', 'conditions']);
  });

  it('the master picks every tool, conditions, walls and lights included', () => {
    expect(toolsOf('master')).toEqual([
      'select',
      'ruler',
      'draw',
      'area',
      'conditions',
      'walls',
      'lights',
    ]);
  });
});

describe('playerIdsOf', () => {
  it('keeps only the players, offline ones too, sorted by id', () => {
    const members = [CAIO_AT_TABLE, ANA_AT_TABLE, duda(), BIA_AT_TABLE];

    expect(playerIdsOf(members)).toEqual([BIA_AT_TABLE.userId, CAIO_AT_TABLE.userId]);
  });

  it('a player demoted to spectator is no longer among them', () => {
    const members = [{ ...BIA_AT_TABLE, role: 'spectator' as const }, CAIO_AT_TABLE];

    expect(playerIdsOf(members)).toEqual([CAIO_AT_TABLE.userId]);
  });
});
