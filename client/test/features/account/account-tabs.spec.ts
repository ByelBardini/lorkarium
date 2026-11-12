import { describe, expect, it } from 'vitest';
import { ACCOUNT_TABS, accountTabOf, accountTabSearch } from '@/features/account/account-tabs';

describe('accountTabOf', () => {
  it('reads each known tab of ?aba=', () => {
    expect(ACCOUNT_TABS.map(({ value }) => accountTabOf(value))).toEqual([
      'perfil',
      'seguranca',
      'plano',
    ]);
  });

  it('a missing or unknown value is Perfil, the old dados included', () => {
    expect(accountTabOf(null)).toBe('perfil');
    expect(accountTabOf('dados')).toBe('perfil');
    expect(accountTabOf('PLANO')).toBe('perfil');
  });
});

describe('accountTabSearch', () => {
  it('Perfil, the default, leaves the query empty', () => {
    expect(accountTabSearch('perfil')).toBe('');
  });

  it('the other tabs go in ?aba= and read back as themselves', () => {
    for (const tab of ['seguranca', 'plano'] as const) {
      const search = accountTabSearch(tab);
      expect(search).toBe(`?aba=${tab}`);
      expect(accountTabOf(new URLSearchParams(search).get('aba'))).toBe(tab);
    }
  });
});
