import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_TABS,
  accountTabOf,
  accountTabsWithEdits,
  accountTabSearch,
} from '@/features/account/account-tabs';

describe('accountTabOf', () => {
  it('reads each known tab of ?aba=', () => {
    expect(ACCOUNT_TABS.map(({ value }) => accountTabOf(value))).toEqual([
      'perfil',
      'dados',
      'seguranca',
      'plano',
    ]);
  });

  it('a missing or unknown value is Perfil', () => {
    expect(accountTabOf(null)).toBe('perfil');
    expect(accountTabOf('senha')).toBe('perfil');
    expect(accountTabOf('PLANO')).toBe('perfil');
  });
});

describe('accountTabsWithEdits', () => {
  it('nickname, color and bio are edited in Perfil; the number color in Dados', () => {
    expect([...accountTabsWithEdits(['name', 'color', 'bio'])]).toEqual(['perfil']);
    expect([...accountTabsWithEdits(['diceNumberColor'])]).toEqual(['dados']);
    expect([...accountTabsWithEdits(['bio', 'diceNumberColor'])]).toEqual(['perfil', 'dados']);
  });

  it('no edit marks no tab', () => {
    expect(accountTabsWithEdits([]).size).toBe(0);
  });
});

describe('accountTabSearch', () => {
  it('Perfil, the default, leaves the query empty', () => {
    expect(accountTabSearch('perfil')).toBe('');
  });

  it('the other tabs go in ?aba= and read back as themselves', () => {
    for (const tab of ['dados', 'seguranca', 'plano'] as const) {
      const search = accountTabSearch(tab);
      expect(search).toBe(`?aba=${tab}`);
      expect(accountTabOf(new URLSearchParams(search).get('aba'))).toBe(tab);
    }
  });
});
